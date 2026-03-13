import { randomUUID } from "crypto";
import { query, withTransaction } from "@/lib/db";
import { type Currency } from "@/src/shared/currency";
import {
	ConflictError,
	WalletFrozenError,
	WalletNotFoundError,
} from "@/src/shared/errors";

export type Wallet = {
	id: string;
	userId: string;
	currency: Currency;
	status: "active" | "frozen";
	balance: number;  // in minor units as a JS number
	createdAt: string;
};

export type LedgerEntry = {
	id: string;
	walletId: string;
	type: string;
	amount: number;     // minor units
	balanceAfter: number; // minor units
	reference: string;
	metadata: Record<string, unknown>;
	createdAt: string;
};

// ── Wallet CRUD ───────────────────────────────────────────────

export const createWallet = async (
	userId: string,
	currency: Currency
): Promise<Wallet> => {
	// Exactly one wallet per user per currency
	const existing = await query<{ id: string }>(
		"SELECT id FROM wallets WHERE user_id = $1 AND currency = $2",
		[userId, currency]
	);
	if (existing.length > 0) {
		throw new ConflictError(`You already have a ${currency} wallet.`);
	}

	const id = randomUUID();
	await query(
		"INSERT INTO wallets (id, user_id, currency) VALUES ($1, $2, $3)",
		[id, userId, currency]
	);

	return { id, userId, currency, status: "active", balance: 0, createdAt: new Date().toISOString() };
};

export const getWalletsByUser = async (userId: string): Promise<Wallet[]> => {
	const rows = await query<{
		wallet_id: string;
		user_id: string;
		currency: Currency;
		status: "active" | "frozen";
		balance: string;
		created_at: string;
	}>(
		`SELECT * FROM wallet_balances WHERE user_id = $1 ORDER BY created_at`,
		[userId]
	);

	return rows.map(mapWallet);
};

export const getWalletById = async (
	walletId: string,
	userId?: string
): Promise<Wallet> => {
	const params: unknown[] = [walletId];
	let sql = "SELECT * FROM wallet_balances WHERE wallet_id = $1";
	if (userId) {
		sql += " AND user_id = $2";
		params.push(userId);
	}

	const rows = await query<{
		wallet_id: string;
		user_id: string;
		currency: Currency;
		status: "active" | "frozen";
		balance: string;
		created_at: string;
	}>(sql, params);

	if (!rows[0]) throw new WalletNotFoundError();
	return mapWallet(rows[0]);
};

export const getWalletByCurrency = async (
	userId: string,
	currency: Currency
): Promise<Wallet> => {
	const rows = await query<{
		wallet_id: string;
		user_id: string;
		currency: Currency;
		status: "active" | "frozen";
		balance: string;
		created_at: string;
	}>(
		"SELECT * FROM wallet_balances WHERE user_id = $1 AND currency = $2",
		[userId, currency]
	);

	if (!rows[0]) throw new WalletNotFoundError(currency);
	return mapWallet(rows[0]);
};

export const freezeWallet = async (walletId: string): Promise<void> => {
	await query("UPDATE wallets SET status = 'frozen' WHERE id = $1", [walletId]);
};

export const unfreezeWallet = async (walletId: string): Promise<void> => {
	await query("UPDATE wallets SET status = 'active' WHERE id = $1", [walletId]);
};

// ── Helpers ───────────────────────────────────────────────────

function mapWallet(row: {
	wallet_id: string;
	user_id: string;
	currency: Currency;
	status: "active" | "frozen";
	balance: string;
	created_at: string;
}): Wallet {
	return {
		id: row.wallet_id,
		userId: row.user_id,
		currency: row.currency,
		status: row.status,
		balance: parseInt(row.balance, 10),
		createdAt: row.created_at,
	};
}
