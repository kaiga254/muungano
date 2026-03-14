import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/src/auth/authService";
import { createQuote } from "@/src/quotes/quoteService";
import { CreateQuoteSchema } from "@/src/shared/validators";
import { toHttpError } from "@/src/shared/errors";
import { env } from "@/config/env";
import { ZodError } from "zod";
import type { Currency } from "@/src/shared/currency";
import {
	assertFundingAccountMatchesWallet,
	getFundingAccountById,
} from "@/src/simulators/fundingAccountService";
import { getWalletById } from "@/src/wallets/walletService";

/** POST /api/quotes — create a payment quote */
export async function POST(request: Request) {
	try {
		const cookieStore = await cookies();
		const token = cookieStore.get(env.sessionCookieName)?.value;
		if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

		const session = await resolveSession(token);
		if (!session) return NextResponse.json({ error: "Session expired." }, { status: 401 });

		const body = await request.json();
		const data = CreateQuoteSchema.parse(body);
		const sourceWallet = await getWalletById(data.sourceWalletId, session.userId);

		let destinationCurrency: Currency =
			(data.destinationCurrency as Currency | undefined) ?? sourceWallet.currency;
		let recipientSummary: Record<string, string>;

		if (data.recipientMode === "linked_account" && data.linkedFundingAccountId) {
			const linkedAccount = await getFundingAccountById(
				session.userId,
				data.linkedFundingAccountId
			);

			assertFundingAccountMatchesWallet({
				fundingAccount: linkedAccount,
				walletCurrency: sourceWallet.currency,
				expectedType: data.recipientType,
			});

			destinationCurrency = linkedAccount.currency;
			recipientSummary = {
				mode: "linked_account",
				type: data.recipientType,
				providerName: linkedAccount.providerName,
				accountName: linkedAccount.accountName,
				accountIdentifier: linkedAccount.accountIdentifier,
				country: linkedAccount.country,
			};
		} else {
			recipientSummary = {
				mode: "manual",
				type: data.recipientType,
				...(data.recipientDetails?.bankName ? { bankName: data.recipientDetails.bankName } : {}),
				...(data.recipientDetails?.accountName ? { accountName: data.recipientDetails.accountName } : {}),
				...(data.recipientDetails?.accountNumber ? { accountNumber: data.recipientDetails.accountNumber } : {}),
				...(data.recipientDetails?.recipientNumber ? { recipientNumber: data.recipientDetails.recipientNumber } : {}),
				...(data.recipientDetails?.recipientAccount ? { recipientAccount: data.recipientDetails.recipientAccount } : {}),
			};
		}

		const quote = await createQuote({
			userId: session.userId,
			sourceWalletId: sourceWallet.id,
			sourceCurrency: sourceWallet.currency,
			destinationCurrency,
			sourceAmount: BigInt(data.sourceAmount),
			metadata: {
				recipientType: data.recipientType,
				recipientMode: data.recipientMode,
				linkedFundingAccountId: data.linkedFundingAccountId ?? null,
				recipientSummary,
			},
		});

		return NextResponse.json(
			{
				quote,
				recipientSummary,
				expiresInSeconds: env.quoteTtlSeconds,
			},
			{ status: 201 }
		);
	} catch (error) {
		if (error instanceof ZodError) {
			return NextResponse.json(
				{ error: error.issues[0]?.message ?? "Validation error." },
				{ status: 400 }
			);
		}
		const { message, status } = toHttpError(error);
		return NextResponse.json({ error: message }, { status });
	}
}
