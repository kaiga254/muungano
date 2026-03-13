import { randomUUID } from "crypto";
import { query, withTransaction } from "@/lib/db";
import type { PoolClient } from "pg";
import {
	InsufficientFundsError,
	WalletFrozenError,
	WalletNotFoundError,
} from "@/src/shared/errors";

export type LedgerEntryType =
	| "deposit"
	| "withdrawal"
	| "transfer_out"
	| "transfer_in"
	| "fx_conversion_out"
	| "fx_conversion_in"
	| "ilp_payment_out"
	| "ilp_payment_in"
	| "fee";

export type LedgerEntry = {
	id: string;
	walletId: string;
	type: LedgerEntryType;
	amount: number;         // minor units
	balanceAfter: number;   // minor units
	reference: string;
	metadata: Record<string, unknown>;
	createdAt: string;
};

export type PostEntryInput = {
	walletId: string;
	type: LedgerEntryType;
	amount: bigint;         // minor units
	reference: string;
	metadata?: Record<string, unknown>;
	/** If true, the amount is subtracted; if false, added. */
	isDebit: boolean;
};

// ── Post a ledger entry (atomic, with balance check for debits) ─

export const postLedgerEntry = async (
	input: PostEntryInput,
	existingClient?: PoolClient
): Promise<LedgerEntry> => {
	const doPost = async (client: PoolClient): Promise<LedgerEntry> => {
		// Lock the wallet row and get current balance
		const walletRows = await client.query<{
			id: string;
			status: string;
			balance: string;
		}>(
			`SELECT w.id, w.status,
			        COALESCE(
			          (SELECT le.balance_after
			           FROM ledger_entries le
			           WHERE le.wallet_id = w.id
			           ORDER BY le.created_at DESC, le.id DESC
			           LIMIT 1),
			          0
			        ) AS balance
			 FROM wallets w
			 WHERE w.id = $1
			 FOR UPDATE`,
			[input.walletId]
		);

		const wallet = walletRows.rows[0];
		if (!wallet) throw new WalletNotFoundError();
		if (wallet.status === "frozen") throw new WalletFrozenError();

		const currentBalance = BigInt(wallet.balance);
		let newBalance: bigint;

		if (input.isDebit) {
			if (input.amount > currentBalance) throw new InsufficientFundsError();
			newBalance = currentBalance - input.amount;
		} else {
			newBalance = currentBalance + input.amount;
		}

		const id = randomUUID();
		const result = await client.query<{
			id: string;
			wallet_id: string;
			type: string;
			amount: string;
			balance_after: string;
			reference: string;
			metadata_json: Record<string, unknown>;
			created_at: string;
		}>(
			`INSERT INTO ledger_entries
				(id, wallet_id, type, amount, balance_after, reference, metadata_json)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)
			 ON CONFLICT (wallet_id, reference) DO NOTHING
			 RETURNING *`,
			[
				id,
				input.walletId,
				input.type,
				String(input.amount),
				String(newBalance),
				input.reference,
				JSON.stringify(input.metadata ?? {}),
			]
		);

		// If DO NOTHING triggered, fetch the existing row
		const row = result.rows[0] ?? (await fetchEntryByReference(client, input.walletId, input.reference));
		return mapEntry(row);
	};

	if (existingClient) {
		return doPost(existingClient);
	}

	return withTransaction(doPost);
};

// ── Fetch ledger entries for a wallet ─────────────────────────

export const getLedgerEntries = async (
	walletId: string,
	limit = 20,
	offset = 0
): Promise<LedgerEntry[]> => {
	const rows = await query<{
		id: string;
		wallet_id: string;
		type: string;
		amount: string;
		balance_after: string;
		reference: string;
		metadata_json: Record<string, unknown>;
		created_at: string;
	}>(
		`SELECT * FROM ledger_entries
		 WHERE wallet_id = $1
		 ORDER BY created_at DESC, id DESC
		 LIMIT $2 OFFSET $3`,
		[walletId, limit, offset]
	);

	return rows.map(mapEntry);
};

// ── Internal helpers ──────────────────────────────────────────

async function fetchEntryByReference(
	client: PoolClient,
	walletId: string,
	reference: string
) {
	const r = await client.query<{
		id: string;
		wallet_id: string;
		type: string;
		amount: string;
		balance_after: string;
		reference: string;
		metadata_json: Record<string, unknown>;
		created_at: string;
	}>(
		"SELECT * FROM ledger_entries WHERE wallet_id = $1 AND reference = $2",
		[walletId, reference]
	);
	return r.rows[0];
}

function mapEntry(row: {
	id: string;
	wallet_id: string;
	type: string;
	amount: string;
	balance_after: string;
	reference: string;
	metadata_json: Record<string, unknown>;
	created_at: string;
}): LedgerEntry {
	return {
		id: row.id,
		walletId: row.wallet_id,
		type: row.type as LedgerEntryType,
		amount: parseInt(row.amount, 10),
		balanceAfter: parseInt(row.balance_after, 10),
		reference: row.reference,
		metadata: row.metadata_json,
		createdAt: row.created_at,
	};
}
