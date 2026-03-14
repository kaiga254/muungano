import { query } from "@/lib/db";
import type { Currency } from "@/src/shared/currency";
import { NotFoundError, ValidationError } from "@/src/shared/errors";

export type FundingAccountType = "bank" | "mobile_money";

export type FundingAccount = {
	id: string;
	userId: string;
	type: FundingAccountType;
	providerName: string;
	accountName: string;
	accountIdentifier: string;
	country: string;
	currency: Currency;
	metadata: Record<string, unknown>;
	isActive: boolean;
	createdAt: string;
};

export type FundingAccountWithBalance = FundingAccount & {
	currentBalance: number;
};

export type FundingAccountTransaction = {
	id: string;
	fundingAccountId: string;
	direction: "credit" | "debit";
	amount: number;
	currency: Currency;
	reference: string;
	narration: string | null;
	balanceBefore: number;
	balanceAfter: number;
	createdAt: string;
};

type FundingAccountRow = {
	id: string;
	user_id: string;
	type: FundingAccountType;
	provider_name: string;
	account_name: string;
	account_identifier: string;
	country: string;
	currency: Currency;
	metadata_json: Record<string, unknown>;
	is_active: boolean;
	created_at: string;
};

const DEMO_ACCOUNTS: Array<{
	key: string;
	type: FundingAccountType;
	providerName: string;
	accountName: string;
	accountIdentifier: string;
	country: string;
	currency: Currency;
	initialBalance: number;
	metadata: Record<string, unknown>;
}> = [
	{
		key: "bank-ncba-ke",
		type: "bank",
		providerName: "NCBA Kenya",
		accountName: "Muungano Demo User",
		accountIdentifier: "011000112233",
		country: "KE",
		currency: "KES",
		initialBalance: 2_500_000_00,
		metadata: { bankCode: "NCBAKE", accountType: "checking" },
	},
	{
		key: "bank-ecobank-mw",
		type: "bank",
		providerName: "EcoBank Malawi",
		accountName: "Muungano Demo User",
		accountIdentifier: "20045098765",
		country: "MW",
		currency: "MWK",
		initialBalance: 1_500_000_000,
		metadata: { bankCode: "ECOBMW", accountType: "current" },
	},
	{
		key: "bank-jpm-us",
		type: "bank",
		providerName: "JP Morgan USA",
		accountName: "Muungano Demo User",
		accountIdentifier: "9300775512",
		country: "US",
		currency: "USD",
		initialBalance: 50_000_00,
		metadata: { bankCode: "JPMUS", accountType: "checking" },
	},
	{
		key: "mobile-mpesa-ke",
		type: "mobile_money",
		providerName: "M-Pesa Kenya",
		accountName: "Muungano Demo User",
		accountIdentifier: "+254700111222",
		country: "KE",
		currency: "KES",
		initialBalance: 500_000_00,
		metadata: { paybillNumber: "522522", network: "Safaricom" },
	},
	{
		key: "mobile-airtel-mw",
		type: "mobile_money",
		providerName: "Airtel Money Malawi",
		accountName: "Muungano Demo User",
		accountIdentifier: "+265991222333",
		country: "MW",
		currency: "MWK",
		initialBalance: 300_000_000,
		metadata: { merchantCode: "AIRTEL-MW", network: "Airtel" },
	},
	{
		key: "mobile-paypal-us",
		type: "mobile_money",
		providerName: "PayPal USA",
		accountName: "Muungano Demo User",
		accountIdentifier: "demo-user@paypal.test",
		country: "US",
		currency: "USD",
		initialBalance: 20_000_00,
		metadata: { merchantCode: "PAYPAL-US", network: "PayPal" },
	},
];

export const ensureDemoFundingAccounts = async (userId: string): Promise<void> => {
	for (const account of DEMO_ACCOUNTS) {
		await query(
			`INSERT INTO external_funding_accounts
				(id, user_id, account_key, type, provider_name, account_name,
				 account_identifier, country, currency, metadata_json, is_active)
			 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
			 ON CONFLICT (user_id, account_key) DO NOTHING`,
			[
				userId,
				account.key,
				account.type,
				account.providerName,
				account.accountName,
				account.accountIdentifier,
				account.country,
				account.currency,
				JSON.stringify({
					...account.metadata,
					initialBalanceMinor: account.initialBalance,
				}),
			]
		);
	}
};

export const listFundingAccountsByUser = async (input: {
	userId: string;
	currency?: Currency;
	type?: FundingAccountType;
}): Promise<FundingAccountWithBalance[]> => {
	await ensureDemoFundingAccounts(input.userId);

	const params: unknown[] = [input.userId];
	const filters: string[] = ["user_id = $1", "is_active = TRUE"];

	if (input.currency) {
		params.push(input.currency);
		filters.push(`currency = $${params.length}`);
	}

	if (input.type) {
		params.push(input.type);
		filters.push(`type = $${params.length}`);
	}

	const rows = await query<FundingAccountRow>(
		`SELECT *
		 FROM external_funding_accounts
		 WHERE ${filters.join(" AND ")}
		 ORDER BY type, provider_name, created_at ASC`,
		params
	);

	const accounts = rows.map(mapFundingAccount);
	return Promise.all(
		accounts.map(async (account) => ({
			...account,
			currentBalance: await getFundingAccountCurrentBalance(account.id, account.metadata),
		}))
	);
};

export const getFundingAccountById = async (
	userId: string,
	fundingAccountId: string
): Promise<FundingAccount> => {
	await ensureDemoFundingAccounts(userId);

	const rows = await query<FundingAccountRow>(
		`SELECT *
		 FROM external_funding_accounts
		 WHERE id = $1 AND user_id = $2 AND is_active = TRUE`,
		[fundingAccountId, userId]
	);

	const row = rows[0];
	if (!row) {
		throw new NotFoundError("Funding account");
	}

	return mapFundingAccount(row);
};

export const listFundingAccountTransactions = async (input: {
	userId: string;
	fundingAccountId: string;
	limit?: number;
	offset?: number;
}): Promise<FundingAccountTransaction[]> => {
	const account = await getFundingAccountById(input.userId, input.fundingAccountId);
	const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
	const offset = Math.max(input.offset ?? 0, 0);

	const rows = await query<{
		id: string;
		funding_account_id: string;
		direction: "credit" | "debit";
		amount: string;
		currency: Currency;
		reference: string;
		narration: string | null;
		balance_before: string;
		balance_after: string;
		created_at: string;
	}>(
		`SELECT *
		 FROM external_funding_account_transactions
		 WHERE funding_account_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`,
		[account.id, limit, offset]
	);

	return rows.map((row) => ({
		id: row.id,
		fundingAccountId: row.funding_account_id,
		direction: row.direction,
		amount: parseInt(row.amount, 10),
		currency: row.currency,
		reference: row.reference,
		narration: row.narration,
		balanceBefore: parseInt(row.balance_before, 10),
		balanceAfter: parseInt(row.balance_after, 10),
		createdAt: row.created_at,
	}));
};

export const postFundingAccountTransaction = async (input: {
	userId: string;
	fundingAccountId: string;
	direction: "credit" | "debit";
	amount: bigint;
	reference: string;
	narration?: string;
	metadata?: Record<string, unknown>;
}): Promise<FundingAccountTransaction> => {
	if (input.amount <= BigInt(0)) {
		throw new ValidationError("Amount must be greater than zero.");
	}

	const account = await getFundingAccountById(input.userId, input.fundingAccountId);
	const currentBalance = await getFundingAccountCurrentBalance(account.id, account.metadata);
	const amountNumber = Number(input.amount);

	if (input.direction === "debit" && currentBalance < amountNumber) {
		throw new ValidationError("Insufficient external funding account balance.");
	}

	const balanceAfter =
		input.direction === "credit"
			? currentBalance + amountNumber
			: currentBalance - amountNumber;

	const rows = await query<{
		id: string;
		funding_account_id: string;
		direction: "credit" | "debit";
		amount: string;
		currency: Currency;
		reference: string;
		narration: string | null;
		balance_before: string;
		balance_after: string;
		created_at: string;
	}>(
		`INSERT INTO external_funding_account_transactions
			(id, funding_account_id, user_id, direction, amount, currency,
			 reference, narration, balance_before, balance_after, metadata_json)
		 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 ON CONFLICT (reference) DO UPDATE SET reference = EXCLUDED.reference
		 RETURNING *`,
		[
			account.id,
			input.userId,
			input.direction,
			String(input.amount),
			account.currency,
			input.reference,
			input.narration ?? null,
			String(currentBalance),
			String(balanceAfter),
			JSON.stringify(input.metadata ?? {}),
		]
	);

	const row = rows[0];
	return {
		id: row.id,
		fundingAccountId: row.funding_account_id,
		direction: row.direction,
		amount: parseInt(row.amount, 10),
		currency: row.currency,
		reference: row.reference,
		narration: row.narration,
		balanceBefore: parseInt(row.balance_before, 10),
		balanceAfter: parseInt(row.balance_after, 10),
		createdAt: row.created_at,
	};
};

export const assertFundingAccountMatchesWallet = (input: {
	fundingAccount: FundingAccount;
	walletCurrency: Currency;
	expectedType?: FundingAccountType;
}) => {
	if (input.fundingAccount.currency !== input.walletCurrency) {
		throw new ValidationError(
			`Funding account currency (${input.fundingAccount.currency}) must match wallet currency (${input.walletCurrency}).`
		);
	}

	if (input.expectedType && input.fundingAccount.type !== input.expectedType) {
		throw new ValidationError(
			`Funding account type (${input.fundingAccount.type}) does not match selected method (${input.expectedType}).`
		);
	}
};

function mapFundingAccount(row: FundingAccountRow): FundingAccount {
	return {
		id: row.id,
		userId: row.user_id,
		type: row.type,
		providerName: row.provider_name,
		accountName: row.account_name,
		accountIdentifier: row.account_identifier,
		country: row.country,
		currency: row.currency,
		metadata: row.metadata_json,
		isActive: row.is_active,
		createdAt: row.created_at,
	};
}

async function getFundingAccountCurrentBalance(
	fundingAccountId: string,
	metadata: Record<string, unknown>
): Promise<number> {
	const initialBalance = Number(metadata.initialBalanceMinor ?? 0);
	const rows = await query<{ balance_after: string }>(
		`SELECT balance_after
		 FROM external_funding_account_transactions
		 WHERE funding_account_id = $1
		 ORDER BY created_at DESC
		 LIMIT 1`,
		[fundingAccountId]
	);

	if (!rows[0]) {
		return initialBalance;
	}

	return parseInt(rows[0].balance_after, 10);
}
