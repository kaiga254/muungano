import { env } from "@/config/env";
import type { Currency } from "@/src/shared/currency";

// =============================================================
// Mock FX rates — replace with a live feed in production
// All rates expressed as: 1 unit of key → value units of other
// =============================================================

type FxPair = `${Currency}_${Currency}`;

function buildRates(): Record<FxPair, number> {
	// Base rates from env
	const kes_usd = env.kes_usd_rate;
	const mwk_usd = env.mwk_usd_rate;
	const mwk_kes = env.mwk_kes_rate;

	return {
		KES_USD: kes_usd,
		KES_MWK: 1 / mwk_kes,
		KES_KES: 1,
		USD_KES: 1 / kes_usd,
		USD_MWK: mwk_usd / kes_usd,  // approximate via USD
		USD_USD: 1,
		MWK_USD: mwk_usd,
		MWK_KES: mwk_kes,
		MWK_MWK: 1,
	} as Record<FxPair, number>;
}

/** Muungano fee rates (as basis points of source amount). */
const MUUNGANO_FEE_BPS = 70;  // 0.7 %
/** Connector fee in source minor units (fixed). */
const CONNECTOR_FEE_MINOR: Record<Currency, bigint> = {
	KES: BigInt(5000),   // KES 50
	MWK: BigInt(30000),  // MWK 300
	USD: BigInt(100),    // USD 1.00
};

export type FxQuoteResult = {
	exchangeRate: number;
	destinationAmount: bigint;
	connectorFee: bigint;
	muunganoFee: bigint;
	totalFee: bigint;
};

export const calculateFxQuote = (
	sourceCurrency: Currency,
	destinationCurrency: Currency,
	sourceAmount: bigint
): FxQuoteResult => {
	const rates = buildRates();
	const pair: FxPair = `${sourceCurrency}_${destinationCurrency}`;
	const rate = rates[pair];

	if (!rate) {
		throw new Error(`Unsupported currency pair: ${sourceCurrency} → ${destinationCurrency}`);
	}

	const connectorFee = CONNECTOR_FEE_MINOR[sourceCurrency];
	const muunganoFee = BigInt(Math.round(Number(sourceAmount) * MUUNGANO_FEE_BPS / 10000));
	const totalFee = connectorFee + muunganoFee;

	const netSourceAmount = sourceAmount - totalFee;
	if (netSourceAmount <= BigInt(0)) {
		throw new Error("Amount too small to cover fees.");
	}

	const destinationAmount = BigInt(Math.round(Number(netSourceAmount) * rate));

	return {
		exchangeRate: rate,
		destinationAmount,
		connectorFee,
		muunganoFee,
		totalFee,
	};
};

export const getSupportedPairs = (): Array<{ from: Currency; to: Currency }> => {
	const currencies: Currency[] = ["KES", "MWK", "USD"];
	const pairs: Array<{ from: Currency; to: Currency }> = [];
	for (const from of currencies) {
		for (const to of currencies) {
			if (from !== to) {
				pairs.push({ from, to });
			}
		}
	}
	return pairs;
};
