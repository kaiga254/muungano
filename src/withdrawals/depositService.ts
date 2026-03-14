import { randomUUID } from "crypto";
import { query, withTransaction } from "@/lib/db";
import { getWalletById } from "@/src/wallets/walletService";
import { postLedgerEntry } from "@/src/wallets/ledgerService";
import { NotFoundError, PinError, ValidationError } from "@/src/shared/errors";
import type { Currency } from "@/src/shared/currency";
import { env } from "@/config/env";
import {
	assertFundingAccountMatchesWallet,
	getFundingAccountById,
	postFundingAccountTransaction,
	type FundingAccount,
} from "@/src/simulators/fundingAccountService";

export type Deposit = {
	id: string;
	userId: string;
	walletId: string;
	amount: number;
	currency: Currency;
	method: "bank" | "mobile_money";
	fundingAccountId?: string | null;
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
	fundingAccountId?: string;
	amount: bigint;
	method: "bank" | "mobile_money";
	simulatorPin?: string;
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
	let fundingAccount: FundingAccount | null = null;
	if (input.fundingAccountId) {
		fundingAccount = await getFundingAccountById(input.userId, input.fundingAccountId);
		assertFundingAccountMatchesWallet({
			fundingAccount,
			walletCurrency: wallet.currency,
			expectedType: input.method,
		});
		assertSimulatorPin(input.simulatorPin);
	}

	const reference = `dep-${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
	const id = randomUUID();

	const instructions = buildInstructions(
		input.method,
		wallet.currency,
		reference,
		fundingAccount
	);

	await query(
		`INSERT INTO deposits
			(id, user_id, wallet_id, funding_account_id, amount, currency, method,
			 status, reference, idempotency_key, metadata_json)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10)`,
		[
			id,
			input.userId,
			input.walletId,
			fundingAccount?.id ?? null,
			String(input.amount),
			wallet.currency,
			input.method,
			reference,
			input.idempotencyKey ?? null,
			JSON.stringify({
				instructions,
				fundingAccount: fundingAccount
					? {
						providerName: fundingAccount.providerName,
						accountIdentifier: fundingAccount.accountIdentifier,
						country: fundingAccount.country,
					}
					: null,
			}),
		]
	);

	try {
		await triggerSimulatorDeposit({
			depositId: id,
			method: input.method,
			amount: Number(input.amount),
			currency: wallet.currency,
			reference,
			fundingAccount,
		});
	} catch (error) {
		await query(
			"UPDATE deposits SET status = 'failed', updated_at = NOW() WHERE id = $1",
			[id]
		);
		throw new ValidationError(
			error instanceof Error ? error.message : "Failed to trigger deposit channel."
		);
	}

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

	if (deposit.funding_account_id) {
		await postFundingAccountTransaction({
			userId: deposit.user_id,
			fundingAccountId: deposit.funding_account_id,
			direction: "debit",
			amount: BigInt(deposit.amount),
			reference: `dep-source-${deposit.reference}`,
			narration: "Deposit to Muungano wallet",
			metadata: { depositId: deposit.id, source: "deposit_confirm" },
		});
	}

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
	reference: string,
	fundingAccount: FundingAccount | null
): DepositInstructions {
	if (method === "bank") {
		return {
			method: "bank",
			reference,
			details: {
				bankName: fundingAccount?.providerName ?? "Muungano Settlement Bank",
				accountName: fundingAccount?.accountName ?? "Muungano Wallet Ltd",
				accountNumber: fundingAccount?.accountIdentifier ?? "1234567890",
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
			provider: fundingAccount?.providerName ?? "M-Pesa Muungano",
			paybillNumber: String(fundingAccount?.metadata?.paybillNumber ?? "522522"),
			accountNumber: fundingAccount?.accountIdentifier ?? reference,
			currency,
			note: "Use your reference code as the account number when sending.",
		},
	};
}

type DepositRow = {
	id: string;
	user_id: string;
	wallet_id: string;
	funding_account_id: string | null;
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
		fundingAccountId: row.funding_account_id,
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

async function triggerSimulatorDeposit(input: {
	depositId: string;
	method: "bank" | "mobile_money";
	amount: number;
	currency: Currency;
	reference: string;
	fundingAccount: FundingAccount | null;
}) {
	const baseUrl =
		input.method === "mobile_money"
			? env.mpesaSimulatorUrl
			: env.bankSimulatorUrl;

	const payload =
		input.method === "mobile_money"
			? {
				depositId: input.depositId,
				amount: input.amount,
				currency: input.currency,
				reference: input.reference,
				phone: input.fundingAccount?.accountIdentifier ?? "+254700000000",
				provider: input.fundingAccount?.providerName,
			}
			: {
				depositId: input.depositId,
				amount: input.amount,
				currency: input.currency,
				reference: input.reference,
				accountNumber: input.fundingAccount?.accountIdentifier ?? "000123456789",
				accountName: input.fundingAccount?.accountName,
				bankName: input.fundingAccount?.providerName,
			};

	const response = await fetch(`${baseUrl}/deposit`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		let message = `Simulator error (${response.status})`;
		try {
			const data = (await response.json()) as { error?: string };
			if (data.error) {
				message = data.error;
			}
		} catch {
			// no-op
		}
		throw new Error(message);
	}
}

function assertSimulatorPin(pin?: string) {
	if (pin !== "123456") {
		throw new PinError("Invalid simulator PIN. Use 123456 for simulator transactions.");
	}
}
