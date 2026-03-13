import { randomUUID } from "crypto";
import { query, withTransaction } from "@/lib/db";
import { useQuote } from "@/src/quotes/quoteService";
import { getWalletById } from "@/src/wallets/walletService";
import { postLedgerEntry } from "@/src/wallets/ledgerService";
import { verifyPin } from "@/src/auth/pinService";
import { NotFoundError, ValidationError } from "@/src/shared/errors";
import type { Currency } from "@/src/shared/currency";

export type InternalTransfer = {
	id: string;
	userId: string;
	sourceWalletId: string;
	destWalletId: string;
	sourceAmount: number;
	destAmount: number;
	fxRate: number;
	quoteId: string | null;
	status: "pending" | "processing" | "completed" | "failed";
	createdAt: string;
};

export const createInternalTransfer = async (input: {
	userId: string;
	quoteId: string;
	pin: string;
	sourceWalletId: string;
	destWalletId: string;
	idempotencyKey?: string;
}): Promise<InternalTransfer> => {
	// Idempotency check
	if (input.idempotencyKey) {
		const existing = await query<{ id: string }>(
			"SELECT id FROM internal_transfers WHERE idempotency_key = $1",
			[input.idempotencyKey]
		);
		if (existing.length > 0) {
			return getTransferById(existing[0].id);
		}
	}

	// Verify PIN
	await verifyPin(input.userId, input.pin);

	// Validate wallets belong to user
	const sourceWallet = await getWalletById(input.sourceWalletId, input.userId);
	const destWallet = await getWalletById(input.destWalletId, input.userId);

	if (sourceWallet.id === destWallet.id) {
		throw new ValidationError("Source and destination wallets must be different.");
	}

	// Consume quote
	const quote = await useQuote(input.quoteId, input.userId);

	// Validate quote matches wallets
	if (quote.sourceCurrency !== sourceWallet.currency) {
		throw new ValidationError("Quote source currency does not match source wallet.");
	}
	if (quote.destinationCurrency !== destWallet.currency) {
		throw new ValidationError("Quote destination currency does not match destination wallet.");
	}

	const transferId = randomUUID();
	const transferRef = `xfer-${transferId}`;

	await withTransaction(async (client) => {
		// Insert transfer record
		await client.query(
			`INSERT INTO internal_transfers
				(id, user_id, source_wallet_id, dest_wallet_id,
				 source_amount, dest_amount, fx_rate, quote_id, status, idempotency_key)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'processing', $9)`,
			[
				transferId,
				input.userId,
				sourceWallet.id,
				destWallet.id,
				String(quote.sourceAmount),
				String(quote.destinationAmount),
				quote.exchangeRate.toString(),
				input.quoteId,
				input.idempotencyKey ?? null,
			]
		);

		// Debit source wallet
		await postLedgerEntry(
			{
				walletId: sourceWallet.id,
				type: "fx_conversion_out",
				amount: BigInt(quote.sourceAmount),
				reference: `${transferRef}-debit`,
				metadata: {
					transferId,
					fromCurrency: sourceWallet.currency,
					toCurrency: destWallet.currency,
					fxRate: quote.exchangeRate,
				},
				isDebit: true,
			},
			client
		);

		// Credit destination wallet
		await postLedgerEntry(
			{
				walletId: destWallet.id,
				type: "fx_conversion_in",
				amount: BigInt(quote.destinationAmount),
				reference: `${transferRef}-credit`,
				metadata: {
					transferId,
					fromCurrency: sourceWallet.currency,
					toCurrency: destWallet.currency,
					fxRate: quote.exchangeRate,
				},
				isDebit: false,
			},
			client
		);
	});

	await query(
		"UPDATE internal_transfers SET status = 'completed' WHERE id = $1",
		[transferId]
	);

	return getTransferById(transferId);
};

export const getTransfersByUser = async (
	userId: string,
	limit = 20,
	offset = 0
): Promise<InternalTransfer[]> => {
	const rows = await query<TransferRow>(
		`SELECT * FROM internal_transfers
		 WHERE user_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`,
		[userId, limit, offset]
	);
	return rows.map(mapTransfer);
};

export const getTransferById = async (id: string): Promise<InternalTransfer> => {
	const rows = await query<TransferRow>(
		"SELECT * FROM internal_transfers WHERE id = $1",
		[id]
	);
	if (!rows[0]) throw new NotFoundError("Transfer");
	return mapTransfer(rows[0]);
};

// ── Types ─────────────────────────────────────────────────────

type TransferRow = {
	id: string;
	user_id: string;
	source_wallet_id: string;
	dest_wallet_id: string;
	source_amount: string;
	dest_amount: string;
	fx_rate: string;
	quote_id: string | null;
	status: "pending" | "processing" | "completed" | "failed";
	created_at: string;
};

function mapTransfer(row: TransferRow): InternalTransfer {
	return {
		id: row.id,
		userId: row.user_id,
		sourceWalletId: row.source_wallet_id,
		destWalletId: row.dest_wallet_id,
		sourceAmount: parseInt(row.source_amount, 10),
		destAmount: parseInt(row.dest_amount, 10),
		fxRate: parseFloat(row.fx_rate),
		quoteId: row.quote_id,
		status: row.status,
		createdAt: row.created_at,
	};
}
