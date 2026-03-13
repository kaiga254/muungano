// =============================================================
// Currency-safe arithmetic for Muungano Wallet
// All amounts are integers representing the smallest currency unit
// e.g. KES 1.50 is stored as 150 (cents)
// =============================================================

export type Currency = "KES" | "MWK" | "USD";

export const SUPPORTED_CURRENCIES: Currency[] = ["KES", "MWK", "USD"];

/** Sub-unit multipliers (cents-equivalent per major unit) */
export const CURRENCY_DECIMALS: Record<Currency, number> = {
	KES: 2,
	MWK: 2,
	USD: 2,
};

/** Convert a major-unit decimal amount to the integer sub-unit representation. */
export function toMinorUnits(amount: number, currency: Currency): bigint {
	const decimals = CURRENCY_DECIMALS[currency];
	// Multiply as integer arithmetic to avoid float errors
	return BigInt(Math.round(amount * Math.pow(10, decimals)));
}

/** Convert an integer sub-unit amount back to major units (for display only). */
export function toMajorUnits(amount: bigint, currency: Currency): number {
	const decimals = CURRENCY_DECIMALS[currency];
	return Number(amount) / Math.pow(10, decimals);
}

/**
 * Format an integer sub-unit amount as a localised currency string.
 * e.g. formatAmount(150000n, 'KES') → 'KES 1,500.00'
 */
export function formatAmount(amount: bigint, currency: Currency): string {
	const major = toMajorUnits(amount, currency);
	return `${currency} ${major.toLocaleString("en-US", {
		minimumFractionDigits: CURRENCY_DECIMALS[currency],
		maximumFractionDigits: CURRENCY_DECIMALS[currency],
	})}`;
}

/**
 * Apply an exchange rate to convert an amount from one currency to another.
 * rate expressed as: 1 source unit = rate destination units
 * Returns the destination amount in minor units (integer).
 */
export function applyExchangeRate(
	sourceAmount: bigint,
	rate: number
): bigint {
	// Use Number arithmetic with rounding – acceptable for display/ledger alignment
	return BigInt(Math.round(Number(sourceAmount) * rate));
}

/** Parse a user-supplied string or number into integer minor units. Throws on invalid input. */
export function parseAmount(raw: unknown, currency: Currency): bigint {
	const n = typeof raw === "string" ? parseFloat(raw) : Number(raw);
	if (!Number.isFinite(n) || n <= 0) {
		throw new Error(`Invalid amount: ${String(raw)}`);
	}
	return toMinorUnits(n, currency);
}

/** Safe addition of two bigint amounts (both in minor units). */
export const addAmounts = (a: bigint, b: bigint): bigint => a + b;

/** Safe subtraction. Throws if result would be negative. */
export function subtractAmounts(a: bigint, b: bigint): bigint {
	if (b > a) throw new Error("Subtraction would result in negative balance.");
	return a - b;
}

/** Convert integer minor-unit amount to a plain number safe for JSON serialisation. */
export const toNumber = (amount: bigint): number => Number(amount);
