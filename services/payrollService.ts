export type SplitRule = {
	key: "wallet" | "familyRemittance" | "savings" | "schoolFees" | "insurance";
	label: string;
	percentage: number;
};

export type SalarySplit = SplitRule & {
	amount: number;
	currency: string;
};

export const DEFAULT_SPLIT_RULES: SplitRule[] = [
	{ key: "wallet", label: "Personal Wallet", percentage: 40 },
	{ key: "familyRemittance", label: "Family Remittance", percentage: 25 },
	{ key: "savings", label: "Savings SACCO", percentage: 15 },
	{ key: "schoolFees", label: "School Fees", percentage: 10 },
	{ key: "insurance", label: "Insurance Premium", percentage: 10 },
];

const roundToCurrency = (value: number): number => {
	return Math.round(value * 100) / 100;
};

export const calculateSalarySplits = (
	totalAmount: number,
	currency = "KES",
	rules: SplitRule[] = DEFAULT_SPLIT_RULES
): SalarySplit[] => {
	if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
		throw new Error("Salary amount must be greater than zero");
	}

	const withAmounts = rules.map((rule) => ({
		...rule,
		amount: roundToCurrency((totalAmount * rule.percentage) / 100),
		currency,
	}));

	const distributed = withAmounts.reduce((sum, item) => sum + item.amount, 0);
	const diff = roundToCurrency(totalAmount - distributed);

	if (diff !== 0) {
		withAmounts[0] = {
			...withAmounts[0],
			amount: roundToCurrency(withAmounts[0].amount + diff),
		};
	}

	return withAmounts;
};
