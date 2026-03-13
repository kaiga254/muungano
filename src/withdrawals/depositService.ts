import { randomUUID } from "crypto";
import { query, withTransaction } from "@/lib/db";
import { getWalletById } from "@/src/wallets/walletService";
import { postLedgerEntry } from "@/src/wallets/ledgerService";
import { NotFoundError, ValidationError } from "@/src/shared/errors";
import type { Currency } from "@/src/shared/currency";

export type Deposit = {
	id: string;
	userId: string;
	walletId: string;
	amount: number;
	currency: Currency;
	method: "bank" | "mobile_money";
	status: "pending" | "processing" | "completed" | "failed";
	reference: string;
	idempotencyKey: string | null;
	metadata: Record<string, unknown>;
	instructions?: DepositInstructions;
	createdAt: string;
};

export type DepositInstructions = {
	method: "bank" | "mobile_money";
	reference: string;
	details: Record<string, string>;
};

export const initiateDeposit = async (input: {
	userId: string;
	walletId: string;
	amount: bigint;
	method: "bank" | "mobile_money";
	idempotencyKey?: string;
}): Promise<Deposit & { instructions: DepositInstructions }> => {
	// Idempotency
	if (input.idempotencyKey) {
		const existing = await query<{ id: string }>(
			"SELECT id FROM deposits WHERE idempotency_key = $1",
			[input.idempotencyKey]
		);
		if (existing.length > 0) {
			return getDepositById(existing[0].id) as Promise<Deposit & { instructions: DepositInstructions }>;
		}
	}

	const wallet = await getWalletById(input.walletId, input.userId);
	const reference = `dep-${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
	const id = randomUUID();

	const instructions = buildInstructions(input.method, wallet.currency, reference);

	await query(
		`INSERT INTO deposits
			(id, user_id, wallet_id, amount, currency, method,
			 status, reference, idempotency_key, metadata_json)
		 VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)`,
		[
			id,
			input.userId,
			input.walletId,
			String(input.amount),
			wallet.currency,
			input.method,
			reference,
			input.idempotencyKey ?? null,
			JSON.stringify({ instructions }),
		]
	);

	const deposit = await getDepositById(id);
	return { ...deposit, instructions };
};

/** Called by the simulator webhook to confirm a deposit and credit the wallet. */
export const confirmDeposit = async (input: {
	depositId: string;
	reference: string;
}): Promise<Deposit> => {
	const rows = await query<DepositRow>(
		"SELECT * FROM deposits WHERE id = $1",
		[input.depositId]
	);

	const deposit = rows[0];
	if (!deposit) throw new NotFoundError("Deposit");
	if (deposit.status === "completed") return mapDeposit(deposit);
	if (deposit.status === "failed") {
		throw new ValidationError("Deposit has already failed.");
	}
	if (deposit.reference !== input.reference) {
		throw new ValidationError("Reference mismatch.");
	}

	await withTransaction(async (client) => {
		// Mark deposit completed
		await client.query(
			"UPDATE deposits SET status = 'completed', updated_at = NOW() WHERE id = $1",
			[deposit.id]
		);

		// Credit the wallet
		await postLedgerEntry(
			{
				walletId: deposit.wallet_id,
				type: "deposit",
				amount: BigInt(deposit.amount),
				reference: `dep-credit-${deposit.reference}`,
				metadata: {
					depositId: deposit.id,
					method: deposit.method,
					reference: deposit.reference,
				},
				isDebit: false,
			},
			client
		);
	});

	return getDepositById(input.depositId);
};

export const getDepositsByUser = async (
	userId: string,
	limit = 20,
	offset = 0
): Promise<Deposit[]> => {
	const rows = await query<DepositRow>(
		`SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		[userId, limit, offset]
	);
	return rows.map(mapDeposit);
};

export const getDepositById = async (id: string): Promise<Deposit> => {
	const rows = await query<DepositRow>("SELECT * FROM deposits WHERE id = $1", [id]);
	if (!rows[0]) throw new NotFoundError("Deposit");
	return mapDeposit(rows[0]);
};

// ── Helpers ───────────────────────────────────────────────────

function buildInstructions(
	method: "bank" | "mobile_money",
	currency: Currency,
	reference: string
): DepositInstructions {
	if (method === "bank") {
		return {
			method: "bank",
			reference,
			details: {
				bankName: "Muungano Settlement Bank",
				accountName: "Muungano Wallet Ltd",
				accountNumber: "1234567890",
				sortCode: "01-23-45",
				currency,
				reference,
				note: "Include your reference code in the bank transfer description.",
			},
		};
	}
	return {
		method: "mobile_money",
		reference,
		details: {
			provider: "M-Pesa Muungano",
			paybillNumber: "522522",
			accountNumber: reference,
			currency,
			note: "Use your reference code as the account number when sending.",
		},
	};
}

type DepositRow = {
	id: string;
	user_id: string;
	wallet_id: string;
	amount: string;
	currency: Currency;
	method: "bank" | "mobile_money";
	status: "pending" | "processing" | "completed" | "failed";
	reference: string;
	idempotency_key: string | null;
	metadata_json: Record<string, unknown>;
	created_at: string;
};

function mapDeposit(row: DepositRow): Deposit {
	return {
		id: row.id,
		userId: row.user_id,
		walletId: row.wallet_id,
		amount: parseInt(row.amount, 10),
		currency: row.currency,
		method: row.method,
		status: row.status,
		reference: row.reference,
		idempotencyKey: row.idempotency_key,
		metadata: row.metadata_json,
		createdAt: row.created_at,
	};
}
