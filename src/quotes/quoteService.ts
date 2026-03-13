import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { env } from "@/config/env";
import type { Currency } from "@/src/shared/currency";
import { toNumber } from "@/src/shared/currency";
import { calculateFxQuote } from "./fxService";
import { QuoteExpiredError, QuoteUsedError, NotFoundError } from "@/src/shared/errors";

export type Quote = {
	id: string;
	userId: string;
	sourceCurrency: Currency;
	destinationCurrency: Currency;
	sourceAmount: number;
	destinationAmount: number;
	exchangeRate: number;
	fees: {
		connector: number;
		muungano: number;
		total: number;
	};
	rafikiQuoteId: string | null;
	expiresAt: string;
	status: "pending" | "used" | "expired" | "rejected";
	createdAt: string;
};

export const createQuote = async (input: {
	userId: string;
	sourceCurrency: Currency;
	destinationCurrency: Currency;
	sourceAmount: bigint;
}): Promise<Quote> => {
	const { exchangeRate, destinationAmount, connectorFee, muunganoFee, totalFee } =
		calculateFxQuote(input.sourceCurrency, input.destinationCurrency, input.sourceAmount);

	const id = randomUUID();
	const expiresAt = new Date(Date.now() + env.quoteTtlSeconds * 1000);

	// Stub Rafiki quote ID in mock mode
	const rafikiQuoteId = env.rafikiMockMode ? `quote_mock_${randomUUID()}` : null;

	const feesJson = {
		connector: toNumber(connectorFee),
		muungano: toNumber(muunganoFee),
		total: toNumber(totalFee),
	};

	const rows = await query<{
		id: string;
		user_id: string;
		source_currency: Currency;
		destination_currency: Currency;
		source_amount: string;
		destination_amount: string;
		exchange_rate: string;
		fees_json: typeof feesJson;
		rafiki_quote_id: string | null;
		expires_at: string;
		status: "pending" | "used" | "expired" | "rejected";
		created_at: string;
	}>(
		`INSERT INTO quotes
			(id, user_id, source_currency, destination_currency,
			 source_amount, destination_amount, exchange_rate,
			 fees_json, rafiki_quote_id, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING *`,
		[
			id,
			input.userId,
			input.sourceCurrency,
			input.destinationCurrency,
			String(input.sourceAmount),
			String(destinationAmount),
			exchangeRate.toString(),
			JSON.stringify(feesJson),
			rafikiQuoteId,
			expiresAt.toISOString(),
		]
	);

	return mapQuote(rows[0]);
};

export const getQuote = async (quoteId: string, userId: string): Promise<Quote> => {
	const rows = await query<QuoteRow>(
		"SELECT * FROM quotes WHERE id = $1 AND user_id = $2",
		[quoteId, userId]
	);
	if (!rows[0]) throw new NotFoundError("Quote");
	return mapQuote(rows[0]);
};

export const useQuote = async (quoteId: string, userId: string): Promise<Quote> => {
	const rows = await query<QuoteRow>(
		"SELECT * FROM quotes WHERE id = $1 AND user_id = $2 FOR UPDATE",
		[quoteId, userId]
	);

	const quote = rows[0];
	if (!quote) throw new NotFoundError("Quote");

	if (quote.status === "used") throw new QuoteUsedError();
	if (quote.status === "expired" || new Date(quote.expires_at) < new Date()) {
		await query("UPDATE quotes SET status = 'expired' WHERE id = $1", [quoteId]);
		throw new QuoteExpiredError();
	}
	if (quote.status === "rejected") throw new QuoteExpiredError();

	await query("UPDATE quotes SET status = 'used' WHERE id = $1", [quoteId]);
	return mapQuote({ ...quote, status: "used" });
};

export const expireStaleQuotes = async (): Promise<void> => {
	await query(
		"UPDATE quotes SET status = 'expired' WHERE status = 'pending' AND expires_at < NOW()"
	);
};

// ── Types / mappers ───────────────────────────────────────────

type QuoteRow = {
	id: string;
	user_id: string;
	source_currency: Currency;
	destination_currency: Currency;
	source_amount: string;
	destination_amount: string;
	exchange_rate: string;
	fees_json: { connector: number; muungano: number; total: number };
	rafiki_quote_id: string | null;
	expires_at: string;
	status: "pending" | "used" | "expired" | "rejected";
	created_at: string;
};

function mapQuote(row: QuoteRow): Quote {
	return {
		id: row.id,
		userId: row.user_id,
		sourceCurrency: row.source_currency,
		destinationCurrency: row.destination_currency,
		sourceAmount: parseInt(row.source_amount, 10),
		destinationAmount: parseInt(row.destination_amount, 10),
		exchangeRate: parseFloat(row.exchange_rate),
		fees: row.fees_json,
		rafikiQuoteId: row.rafiki_quote_id,
		expiresAt: row.expires_at,
		status: row.status,
		createdAt: row.created_at,
	};
}
