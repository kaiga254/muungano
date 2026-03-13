import { randomUUID } from "crypto";
import { query, withTransaction } from "@/lib/db";
import type { PoolClient } from "pg";
import { useQuote } from "@/src/quotes/quoteService";
import { postLedgerEntry } from "@/src/wallets/ledgerService";
import { verifyPin } from "@/src/auth/pinService";
import { createIncomingPayment, sendOutgoingPayment, getPaymentStatus } from "@/src/integrations/ilp/rafikiAdapter";
import { checkAndUpdateRateLimit } from "@/src/transactions/transactionService";
import { logFraudEvent } from "@/src/transactions/fraudService";
import {
	NotFoundError,
	ValidationError,
	WalletFrozenError,
} from "@/src/shared/errors";
import type { Currency } from "@/src/shared/currency";

export type Payment = {
	id: string;
	senderWalletId: string;
	receiverIdentifier: string;
	receiverType: "phone" | "ilp_address" | "wallet_id";
	amount: number;
	currency: Currency;
	quoteId: string | null;
	rafikiPaymentId: string | null;
	status: "pending" | "processing" | "completed" | "failed";
	idempotencyKey: string | null;
	createdAt: string;
};

export const sendPayment = async (input: {
	userId: string;
	quoteId: string;
	pin: string;
	receiverIdentifier: string;
	receiverType: "phone" | "ilp_address" | "wallet_id";
	idempotencyKey?: string;
}): Promise<Payment> => {
	// 1. Idempotency check
	if (input.idempotencyKey) {
		const existing = await query<{ id: string }>(
			"SELECT id FROM payments WHERE idempotency_key = $1",
			[input.idempotencyKey]
		);
		if (existing.length > 0) {
			return getPaymentById(existing[0].id);
		}
	}

	// 2. Verify PIN
	await verifyPin(input.userId, input.pin);

	// 3. Lock and consume the quote
	const quote = await useQuote(input.quoteId, input.userId);

	// 4. Get sender wallet by quote source currency
	const { getWalletByCurrency } = await import("@/src/wallets/walletService");
	const senderWallet = await getWalletByCurrency(input.userId, quote.sourceCurrency);
	if (senderWallet.status === "frozen") throw new WalletFrozenError();

	// 5. Rate-limit check
	await checkAndUpdateRateLimit(input.userId, BigInt(quote.sourceAmount), quote.sourceCurrency);

	// 6. Fraud check: large transfer
	const usdEquivalent = quote.sourceAmount * 100; // simplified
	if (usdEquivalent > 50000_00) { // > $500 USD-equivalent
		await logFraudEvent(input.userId, "large_transfer", {
			quoteId: input.quoteId,
			amount: quote.sourceAmount,
			currency: quote.sourceCurrency,
		});
	}

	const paymentId = randomUUID();
	const reference = `pay-out-${paymentId}`;

	return withTransaction(async (client) => {
		// 7. Create payment record
		await client.query(
			`INSERT INTO payments
				(id, sender_wallet_id, receiver_identifier, receiver_type,
				 amount, currency, quote_id, status, idempotency_key)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing', $8)`,
			[
				paymentId,
				senderWallet.id,
				input.receiverIdentifier,
				input.receiverType,
				String(quote.sourceAmount),
				quote.sourceCurrency,
				input.quoteId,
				input.idempotencyKey ?? null,
			]
		);

		// 8. Debit sender wallet
		await postLedgerEntry(
			{
				walletId: senderWallet.id,
				type: "ilp_payment_out",
				amount: BigInt(quote.sourceAmount),
				reference,
				metadata: {
					quoteId: input.quoteId,
					receiver: input.receiverIdentifier,
					receiverType: input.receiverType,
				},
				isDebit: true,
			},
			client
		);

		return client;
	}).then(async (_client) => {
		// 9. Execute ILP payment (outside transaction — network call)
		let rafikiPaymentId: string | null = null;
		let finalStatus: "completed" | "failed" = "failed";

		try {
			const incoming = await createIncomingPayment(
				resolveIlpAddress(input.receiverIdentifier, input.receiverType),
				BigInt(quote.destinationAmount),
				quote.destinationCurrency
			);

			const outgoing = await sendOutgoingPayment({
				quoteId: input.quoteId,
				rafikiQuoteId: quote.rafikiQuoteId,
				sourceAmount: BigInt(quote.sourceAmount),
				sourceCurrency: quote.sourceCurrency,
				destinationAmount: BigInt(quote.destinationAmount),
				destinationCurrency: quote.destinationCurrency,
				receiverIlpAddress: incoming.ilpAddress,
			});

			rafikiPaymentId = outgoing.rafikiPaymentId;
			const status = await getPaymentStatus(rafikiPaymentId);
			finalStatus = status === "COMPLETED" ? "completed" : "failed";
		} catch {
			finalStatus = "failed";
		}

		// If payment failed, we need to reverse the debit
		if (finalStatus === "failed") {
			const reverseRef = `${reference}-reversal`;
			await postLedgerEntry({
				walletId: senderWallet.id,
				type: "ilp_payment_in",  // reversal credit
				amount: BigInt(quote.sourceAmount),
				reference: reverseRef,
				metadata: { reason: "payment_failed", originalReference: reference },
				isDebit: false,
			});
		}

		// 10. Update payment record
		await query(
			`UPDATE payments SET status = $1, rafiki_payment_id = $2, updated_at = NOW()
			 WHERE id = $3`,
			[finalStatus, rafikiPaymentId, paymentId]
		);

		return getPaymentById(paymentId);
	});
};

export const getPaymentHistory = async (
	userId: string,
	limit = 20,
	offset = 0
): Promise<Payment[]> => {
	const rows = await query<PaymentRow>(
		`SELECT p.*
		 FROM payments p
		 JOIN wallets w ON w.id = p.sender_wallet_id
		 WHERE w.user_id = $1
		 ORDER BY p.created_at DESC
		 LIMIT $2 OFFSET $3`,
		[userId, limit, offset]
	);
	return rows.map(mapPayment);
};

export const getPaymentById = async (paymentId: string): Promise<Payment> => {
	const rows = await query<PaymentRow>(
		"SELECT * FROM payments WHERE id = $1",
		[paymentId]
	);
	if (!rows[0]) throw new NotFoundError("Payment");
	return mapPayment(rows[0]);
};

// ── Helpers ───────────────────────────────────────────────────

function resolveIlpAddress(
	identifier: string,
	type: "phone" | "ilp_address" | "wallet_id"
): string {
	if (type === "ilp_address") return identifier;
	// For phone/wallet_id — in production, resolve via routing service
	// For mock, construct a synthetic ILP address
	return `g.muungano.${identifier.replace(/[^a-z0-9]/gi, "")}`;
}

type PaymentRow = {
	id: string;
	sender_wallet_id: string;
	receiver_identifier: string;
	receiver_type: "phone" | "ilp_address" | "wallet_id";
	amount: string;
	currency: Currency;
	quote_id: string | null;
	rafiki_payment_id: string | null;
	status: "pending" | "processing" | "completed" | "failed";
	idempotency_key: string | null;
	created_at: string;
};

function mapPayment(row: PaymentRow): Payment {
	return {
		id: row.id,
		senderWalletId: row.sender_wallet_id,
		receiverIdentifier: row.receiver_identifier,
		receiverType: row.receiver_type,
		amount: parseInt(row.amount, 10),
		currency: row.currency,
		quoteId: row.quote_id,
		rafikiPaymentId: row.rafiki_payment_id,
		status: row.status,
		idempotencyKey: row.idempotency_key,
		createdAt: row.created_at,
	};
}
