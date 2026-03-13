import { randomUUID } from "crypto";
import { query, withTransaction } from "@/lib/db";
import { getWalletById } from "@/src/wallets/walletService";
import { postLedgerEntry } from "@/src/wallets/ledgerService";
import { verifyPin } from "@/src/auth/pinService";
import { NotFoundError } from "@/src/shared/errors";
import type { Currency } from "@/src/shared/currency";

export type Withdrawal = {
	id: string;
	userId: string;
	walletId: string;
	destinationType: "bank" | "mobile_money";
	destinationDetails: Record<string, string>;
	amount: number;
	currency: Currency;
	fee: number;
	status: "pending" | "processing" | "completed" | "failed";
	idempotencyKey: string | null;
	createdAt: string;
};

// Fee schedule (in minor units)
const WITHDRAWAL_FEES: Record<"bank" | "mobile_money", Record<Currency, bigint>> = {
	bank: { KES: BigInt(10000), MWK: BigInt(50000), USD: BigInt(200) },          // ~100 KES / ~500 MWK / $2
	mobile_money: { KES: BigInt(5000), MWK: BigInt(25000), USD: BigInt(100) },   // ~50 KES / ~250 MWK / $1
};

export const getWithdrawalFee = (
	method: "bank" | "mobile_money",
	currency: Currency
): bigint => WITHDRAWAL_FEES[method][currency];

export const initiateWithdrawal = async (input: {
	userId: string;
	walletId: string;
	amount: bigint;
	destinationType: "bank" | "mobile_money";
	destinationDetails: Record<string, string>;
	pin: string;
	idempotencyKey?: string;
}): Promise<Withdrawal> => {
	// Idempotency
	if (input.idempotencyKey) {
		const existing = await query<{ id: string }>(
			"SELECT id FROM withdrawals WHERE idempotency_key = $1",
			[input.idempotencyKey]
		);
		if (existing.length > 0) {
			return getWithdrawalById(existing[0].id);
		}
	}

	// Verify PIN
	await verifyPin(input.userId, input.pin);

	// Validate wallet
	const wallet = await getWalletById(input.walletId, input.userId);

	const fee = getWithdrawalFee(input.destinationType, wallet.currency);
	const totalDebit = input.amount + fee;
	const withdrawalId = randomUUID();
	const reference = `wdraw-${withdrawalId}`;

	await withTransaction(async (client) => {
		// Insert withdrawal record
		await client.query(
			`INSERT INTO withdrawals
				(id, user_id, wallet_id, destination_type, destination_details_json,
				 amount, currency, fee, status, idempotency_key)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'processing', $9)`,
			[
				withdrawalId,
				input.userId,
				input.walletId,
				input.destinationType,
				JSON.stringify(input.destinationDetails),
				String(input.amount),
				wallet.currency,
				String(fee),
				input.idempotencyKey ?? null,
			]
		);

		// Debit wallet (amount + fee)
		await postLedgerEntry(
			{
				walletId: input.walletId,
				type: "withdrawal",
				amount: totalDebit,
				reference: `${reference}-debit`,
				metadata: {
					withdrawalId,
					destinationType: input.destinationType,
					net: String(input.amount),
					fee: String(fee),
				},
				isDebit: true,
			},
			client
		);

		// Fee ledger entry
		if (fee > BigInt(0)) {
			await postLedgerEntry(
				{
					walletId: input.walletId,
					type: "fee",
					amount: fee,
					reference: `${reference}-fee`,
					metadata: { withdrawalId, feeType: "withdrawal_fee" },
					isDebit: false, // already debited above — this is a re-categorisation entry
					// Note: balance_after will be the same as the withdrawal debit
					// In a more granular setup, fees could be split separately
				},
				client
			);
		}
	});

	// In production: dispatch to bank/mobile-money provider
	// For now: mark completed immediately (mock)
	await query(
		"UPDATE withdrawals SET status = 'completed', updated_at = NOW() WHERE id = $1",
		[withdrawalId]
	);

	return getWithdrawalById(withdrawalId);
};

export const getWithdrawalsByUser = async (
	userId: string,
	limit = 20,
	offset = 0
): Promise<Withdrawal[]> => {
	const rows = await query<WithdrawalRow>(
		`SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		[userId, limit, offset]
	);
	return rows.map(mapWithdrawal);
};

export const getWithdrawalById = async (id: string): Promise<Withdrawal> => {
	const rows = await query<WithdrawalRow>(
		"SELECT * FROM withdrawals WHERE id = $1",
		[id]
	);
	if (!rows[0]) throw new NotFoundError("Withdrawal");
	return mapWithdrawal(rows[0]);
};

// ── Types ─────────────────────────────────────────────────────

type WithdrawalRow = {
	id: string;
	user_id: string;
	wallet_id: string;
	destination_type: "bank" | "mobile_money";
	destination_details_json: Record<string, string>;
	amount: string;
	currency: Currency;
	fee: string;
	status: "pending" | "processing" | "completed" | "failed";
	idempotency_key: string | null;
	created_at: string;
};

function mapWithdrawal(row: WithdrawalRow): Withdrawal {
	return {
		id: row.id,
		userId: row.user_id,
		walletId: row.wallet_id,
		destinationType: row.destination_type,
		destinationDetails: row.destination_details_json,
		amount: parseInt(row.amount, 10),
		currency: row.currency,
		fee: parseInt(row.fee, 10),
		status: row.status,
		idempotencyKey: row.idempotency_key,
		createdAt: row.created_at,
	};
}
