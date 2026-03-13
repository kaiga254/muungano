import { query } from "@/lib/db";
import { env } from "@/config/env";
import type { Currency } from "@/src/shared/currency";
import { RateLimitError } from "@/src/shared/errors";

// Tier-1 limits (in source minor units as bigint)
const DAILY_TRANSFER_LIMIT_USD_CENTS = BigInt(200000); // $2,000.00
const SINGLE_TRANSFER_LIMIT_USD_CENTS = BigInt(50000);  // $500.00

// Approximate USD-cent value for a given currency amount
const toUsdCents = (amount: bigint, currency: Currency): bigint => {
	const rates: Record<Currency, number> = {
		KES: env.kes_usd_rate,
		MWK: env.mwk_usd_rate,
		USD: 1,
	};
	return BigInt(Math.round(Number(amount) * rates[currency] * 100));
};

export const checkAndUpdateRateLimit = async (
	userId: string,
	amount: bigint,
	currency: Currency
): Promise<void> => {
	const usdCents = toUsdCents(amount, currency);

	// Single-transfer limit
	if (usdCents > SINGLE_TRANSFER_LIMIT_USD_CENTS) {
		throw new RateLimitError("Single transfer exceeds the $500 limit for Tier-1 accounts.");
	}

	// Upsert daily rate limit row
	const rows = await query<{
		transfer_count: number;
		transfer_volume: string;
	}>(
		`INSERT INTO rate_limits (user_id, date, transfer_count, transfer_volume)
		 VALUES ($1, CURRENT_DATE, 0, 0)
		 ON CONFLICT (user_id, date) DO UPDATE
		   SET transfer_count = rate_limits.transfer_count,
		       transfer_volume = rate_limits.transfer_volume
		 RETURNING transfer_count, transfer_volume`,
		[userId]
	);

	const existing = rows[0];
	const currentVolume = existing ? BigInt(existing.transfer_volume) : BigInt(0);
	const projectedVolume = currentVolume + usdCents;

	if (projectedVolume > DAILY_TRANSFER_LIMIT_USD_CENTS) {
		throw new RateLimitError("Daily transfer limit of $2,000 reached.");
	}

	// Update the counters
	await query(
		`UPDATE rate_limits
		 SET transfer_count = transfer_count + 1,
		     transfer_volume = transfer_volume + $1
		 WHERE user_id = $2 AND date = CURRENT_DATE`,
		[String(usdCents), userId]
	);
};
