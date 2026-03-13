import { randomUUID } from "crypto";
import { query, withTransaction } from "@/lib/db";
import { env } from "@/config/env";
import { rafikiService } from "@/services/rafikiService";
import { calculateSalarySplits } from "@/services/payrollService";
import { getEmployee } from "@/services/employeeService";
import type { SalarySplit } from "@/services/payrollService";

/** How long (minutes) a generated quote is valid before expiry. */
const QUOTE_TTL_MINUTES = 10;

export type PayrollQuote = {
	id: string;
	companyId: string;
	employeeId: string;
	employeeName: string;
	destinationPointer: string;
	sourceAmount: number;
	sourceCurrency: string;
	destinationAmount: number;
	destinationCurrency: string;
	/** Exchange rate: 1 MWK = X KES */
	exchangeRate: number;
	/** Any platform/processing fee on top of the principal (currently 0) */
	transactionFee: number;
	splits: SalarySplit[];
	rafikiQuoteId: string;
	generatedBy: string;
	payPeriod?: string;
	expiresAt: string;
	status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
	createdAt: string;
};

// ---------------------------------------------------------------------------
// Internal row mapper
// ---------------------------------------------------------------------------
const mapQuoteRow = (row: Record<string, unknown>): PayrollQuote => ({
	id: row.id as string,
	companyId: row.company_id as string,
	employeeId: row.employee_id as string,
	employeeName: row.employee_name as string,
	destinationPointer: row.destination_pointer as string,
	sourceAmount: Number(row.source_amount),
	sourceCurrency: row.source_currency as string,
	destinationAmount: Number(row.destination_amount),
	destinationCurrency: row.destination_currency as string,
	exchangeRate: Number(row.exchange_rate),
	transactionFee: Number(row.transaction_fee),
	splits: row.splits_json as SalarySplit[],
	rafikiQuoteId: row.rafiki_quote_id as string,
	generatedBy: row.generated_by as string,
	payPeriod: (row.pay_period as string | null) ?? undefined,
	expiresAt:
		(row.expires_at as Date).toISOString?.() ?? String(row.expires_at),
	status: row.status as PayrollQuote["status"],
	createdAt:
		(row.created_at as Date).toISOString?.() ?? String(row.created_at),
});

// ---------------------------------------------------------------------------
// Generate – fetch employee, create Rafiki quote, persist to DB
// ---------------------------------------------------------------------------
export const generatePayrollQuote = async (input: {
	employeeId: string;
	companyId: string;
	generatedBy: string;
	payPeriod?: string;
}): Promise<PayrollQuote> => {
	const employee = await getEmployee(input.employeeId, input.companyId);
	if (!employee) throw new Error("Employee not found.");
	if (!employee.isActive)
		throw new Error("Cannot generate a quote for an inactive employee.");

	const destinationAmount = Number(
		(employee.salaryAmount * env.mwkToKesRate).toFixed(2),
	);
	const splits = calculateSalarySplits(
		destinationAmount,
		"KES",
		employee.splitRules,
	);

	const rafikiQuote = await rafikiService.createQuote({
		sourceAmount: employee.salaryAmount,
		sourceCurrency: "MWK",
		destinationAmount,
		destinationCurrency: "KES",
		receiverWalletAddress: employee.destinationPointer,
	});

	const id = randomUUID();
	const expiresAt = new Date(
		Date.now() + QUOTE_TTL_MINUTES * 60 * 1_000,
	).toISOString();

	await query(
		`INSERT INTO payroll_quotes (
			id, company_id, employee_id, generated_by,
			employee_name, source_amount, source_currency,
			destination_amount, destination_currency, destination_pointer,
			exchange_rate, transaction_fee, splits_json, rafiki_quote_id,
			pay_period, status, expires_at
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7,
			$8, $9, $10,
			$11, $12, $13::jsonb, $14,
			$15, 'PENDING', $16::timestamptz
		)`,
		[
			id,
			input.companyId,
			input.employeeId,
			input.generatedBy,
			employee.fullName,
			employee.salaryAmount,
			"MWK",
			destinationAmount,
			"KES",
			employee.destinationPointer,
			rafikiQuote.exchangeRate,
			0, // fees placeholder – extend here for fee logic
			JSON.stringify(splits),
			rafikiQuote.id,
			input.payPeriod ?? null,
			expiresAt,
		],
	);

	return {
		id,
		companyId: input.companyId,
		employeeId: input.employeeId,
		employeeName: employee.fullName,
		destinationPointer: employee.destinationPointer,
		sourceAmount: employee.salaryAmount,
		sourceCurrency: "MWK",
		destinationAmount,
		destinationCurrency: "KES",
		exchangeRate: rafikiQuote.exchangeRate,
		transactionFee: 0,
		splits,
		rafikiQuoteId: rafikiQuote.id,
		generatedBy: input.generatedBy,
		payPeriod: input.payPeriod,
		expiresAt,
		status: "PENDING",
		createdAt: new Date().toISOString(),
	};
};

// ---------------------------------------------------------------------------
// Fetch a single quote (scoped to company)
// ---------------------------------------------------------------------------
export const getPayrollQuote = async (
	quoteId: string,
	companyId: string,
): Promise<PayrollQuote | null> => {
	const rows = await query<Record<string, unknown>>(
		`SELECT * FROM payroll_quotes WHERE id = $1 AND company_id = $2`,
		[quoteId, companyId],
	);
	return rows.length ? mapQuoteRow(rows[0]) : null;
};

// ---------------------------------------------------------------------------
// Approve & consume – validates TTL, marks APPROVED (idempotency-safe lock)
// ---------------------------------------------------------------------------
export const approvePayrollQuote = async (
	quoteId: string,
	companyId: string,
): Promise<PayrollQuote> => {
	return withTransaction(async (client) => {
		const result = await client.query(
			`SELECT * FROM payroll_quotes
			 WHERE id = $1 AND company_id = $2
			 FOR UPDATE`,
			[quoteId, companyId],
		);

		if (!result.rowCount)
			throw new Error("Quote not found.");

		const quote = mapQuoteRow(result.rows[0] as Record<string, unknown>);

		if (quote.status === "APPROVED")
			throw new Error("Quote has already been approved and used.");
		if (quote.status === "REJECTED")
			throw new Error("Quote was rejected.");
		if (
			quote.status === "EXPIRED" ||
			new Date(quote.expiresAt) < new Date()
		) {
			await client.query(
				`UPDATE payroll_quotes SET status = 'EXPIRED' WHERE id = $1`,
				[quoteId],
			);
			throw new Error(
				"This quote has expired. Please generate a new one.",
			);
		}

		await client.query(
			`UPDATE payroll_quotes
			 SET status = 'APPROVED', approved_at = NOW()
			 WHERE id = $1`,
			[quoteId],
		);

		return { ...quote, status: "APPROVED" };
	});
};

// ---------------------------------------------------------------------------
// Reject a quote (admin cancels at the confirmation dialog)
// ---------------------------------------------------------------------------
export const rejectPayrollQuote = async (
	quoteId: string,
	companyId: string,
): Promise<void> => {
	await query(
		`UPDATE payroll_quotes
		 SET status = 'REJECTED'
		 WHERE id = $1 AND company_id = $2 AND status = 'PENDING'`,
		[quoteId, companyId],
	);
};
