import { randomUUID } from "crypto";
import { query, withTransaction } from "@/lib/db";
import { getWalletById } from "@/src/wallets/walletService";
import { postLedgerEntry } from "@/src/wallets/ledgerService";
import { verifyPin } from "@/src/auth/pinService";
import { NotFoundError, PinError, ValidationError } from "@/src/shared/errors";
import type { Currency } from "@/src/shared/currency";
import { env } from "@/config/env";
import {
	assertFundingAccountMatchesWallet,
	getFundingAccountById,
	postFundingAccountTransaction,
	type FundingAccount,
} from "@/src/simulators/fundingAccountService";

export type Withdrawal = {
	id: string;
	userId: string;
	walletId: string;
	fundingAccountId?: string | null;
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
	fundingAccountId?: string;
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

	// Validate wallet
	const wallet = await getWalletById(input.walletId, input.userId);

	let fundingAccount: FundingAccount | null = null;
	if (input.fundingAccountId) {
		fundingAccount = await getFundingAccountById(input.userId, input.fundingAccountId);
		assertFundingAccountMatchesWallet({
			fundingAccount,
			walletCurrency: wallet.currency,
			expectedType: input.destinationType,
		});
	}

	if (input.pin === "123456") {
		if (!fundingAccount) {
			throw new PinError("Simulator PIN can only be used with simulator funding accounts.");
		}
	} else {
		await verifyPin(input.userId, input.pin);
	}

	const fee = getWithdrawalFee(input.destinationType, wallet.currency);
	const totalDebit = input.amount + fee;
	const withdrawalId = randomUUID();
	const reference = `wdraw-${withdrawalId}`;
	const resolvedDetails =
		fundingAccount !== null
			? {
				providerName: fundingAccount.providerName,
				accountName: fundingAccount.accountName,
				accountIdentifier: fundingAccount.accountIdentifier,
				country: fundingAccount.country,
				...Object.fromEntries(
					Object.entries(fundingAccount.metadata).map(([key, value]) => [
						key,
						String(value),
					])
				),
			}
			: input.destinationDetails;

	try {
		await triggerSimulatorWithdrawal({
			withdrawalId,
			method: input.destinationType,
			amount: Number(input.amount),
			currency: wallet.currency,
			reference,
			fundingAccount,
			destinationDetails: resolvedDetails,
		});
	} catch (error) {
		throw new ValidationError(
			error instanceof Error ? error.message : "Failed to trigger withdrawal channel."
		);
	}

	await withTransaction(async (client) => {
		// Insert withdrawal record
		await client.query(
			`INSERT INTO withdrawals
				(id, user_id, wallet_id, funding_account_id, destination_type, destination_details_json,
				 amount, currency, fee, status, idempotency_key)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'processing', $10)`,
			[
				withdrawalId,
				input.userId,
				input.walletId,
				fundingAccount?.id ?? null,
				input.destinationType,
				JSON.stringify(resolvedDetails),
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
					fundingAccountId: fundingAccount?.id ?? null,
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

	// Near-instant simulator settlement
	await query(
		"UPDATE withdrawals SET status = 'completed', updated_at = NOW() WHERE id = $1",
		[withdrawalId]
	);

	if (fundingAccount) {
		await postFundingAccountTransaction({
			userId: input.userId,
			fundingAccountId: fundingAccount.id,
			direction: "credit",
			amount: input.amount,
			reference: `${reference}-dest-credit`,
			narration: "Withdrawal from Muungano wallet",
			metadata: { withdrawalId, source: "withdrawal_complete" },
		});
	}

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
	funding_account_id: string | null;
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
		fundingAccountId: row.funding_account_id,
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

async function triggerSimulatorWithdrawal(input: {
	withdrawalId: string;
	method: "bank" | "mobile_money";
	amount: number;
	currency: Currency;
	reference: string;
	fundingAccount: FundingAccount | null;
	destinationDetails: Record<string, string>;
}) {
	const baseUrl =
		input.method === "mobile_money"
			? env.mpesaSimulatorUrl
			: env.bankSimulatorUrl;

	const payload =
		input.method === "mobile_money"
			? {
				withdrawalId: input.withdrawalId,
				amount: input.amount,
				currency: input.currency,
				reference: input.reference,
				phone:
					input.fundingAccount?.accountIdentifier ??
					input.destinationDetails.phoneNumber ??
					input.destinationDetails.account,
			}
			: {
				withdrawalId: input.withdrawalId,
				amount: input.amount,
				currency: input.currency,
				reference: input.reference,
				accountNumber:
					input.fundingAccount?.accountIdentifier ??
					input.destinationDetails.accountNumber ??
					input.destinationDetails.account,
				bankCode: input.destinationDetails.bankCode,
			};

	const response = await fetch(`${baseUrl}/withdraw`, {
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
