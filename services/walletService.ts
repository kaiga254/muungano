import { query } from "@/lib/db";
import type { DistributionEntry } from "./distributionService";
import type { SalarySplit } from "./payrollService";

export type PayrollRunRecord = {
	id: string;
	companyId?: string;
	employeeId?: string;
	createdBy?: string;
	employeeName: string;
	sourceAmount: number;
	sourceCurrency: string;
	destinationAmount: number;
	destinationCurrency: string;
	destinationPointer: string;
	quoteId: string;
	paymentId: string;
	status: "COMPLETED" | "PENDING" | "FAILED";
	splits: SalarySplit[];
	distributionResults: DistributionEntry[];
	createdAt: string;
};

export const logPayrollRun = async (record: PayrollRunRecord): Promise<void> => {
	await query(
		`INSERT INTO payroll_transactions (
			id, company_id, employee_id, created_by,
			employee_name, source_amount, source_currency,
			destination_amount, destination_currency, destination_pointer,
			quote_id, payment_id, status, splits_json, distribution_json, created_at
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7,
			$8, $9, $10,
			$11, $12, $13, $14::jsonb, $15::jsonb, $16::timestamptz
		)
		ON CONFLICT (id) DO NOTHING`,
		[
			record.id,
			record.companyId ?? null,
			record.employeeId ?? null,
			record.createdBy ?? null,
			record.employeeName,
			record.sourceAmount,
			record.sourceCurrency,
			record.destinationAmount,
			record.destinationCurrency,
			record.destinationPointer,
			record.quoteId,
			record.paymentId,
			record.status,
			JSON.stringify(record.splits),
			JSON.stringify(record.distributionResults),
			record.createdAt,
		]
	);
};

export const getRecentPayrollRuns = async (
	limit = 20,
	companyId?: string
): Promise<PayrollRunRecord[]> => {
	const rows = await query<Record<string, unknown>>(
		companyId
			? `SELECT * FROM payroll_transactions
			   WHERE company_id = $1
			   ORDER BY created_at DESC LIMIT $2`
			: `SELECT * FROM payroll_transactions ORDER BY created_at DESC LIMIT $1`,
		companyId ? [companyId, limit] : [limit]
	);

	return rows.map((row) => ({
		id: row.id as string,
		companyId: (row.company_id as string) ?? undefined,
		employeeId: (row.employee_id as string) ?? undefined,
		createdBy: (row.created_by as string) ?? undefined,
		employeeName: row.employee_name as string,
		sourceAmount: Number(row.source_amount),
		sourceCurrency: row.source_currency as string,
		destinationAmount: Number(row.destination_amount),
		destinationCurrency: row.destination_currency as string,
		destinationPointer: row.destination_pointer as string,
		quoteId: row.quote_id as string,
		paymentId: row.payment_id as string,
		status: row.status as PayrollRunRecord["status"],
		splits: row.splits_json as SalarySplit[],
		distributionResults: row.distribution_json as DistributionEntry[],
		createdAt: (row.created_at as Date).toISOString?.() ?? String(row.created_at),
	}));
};
