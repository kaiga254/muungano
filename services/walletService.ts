import { Pool } from "pg";
import { env } from "@/config/env";
import type { DistributionEntry } from "./distributionService";
import type { SalarySplit } from "./payrollService";

export type PayrollRunRecord = {
	id: string;
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

let pool: Pool | undefined;
const localStore: PayrollRunRecord[] = [];

const getPool = (): Pool | undefined => {
	if (!env.databaseUrl) {
		return undefined;
	}

	if (!pool) {
		pool = new Pool({ connectionString: env.databaseUrl });
	}

	return pool;
};

export const logPayrollRun = async (record: PayrollRunRecord): Promise<void> => {
	localStore.unshift(record);
	localStore.splice(50);

	const dbPool = getPool();
	if (!dbPool) {
		return;
	}

	await dbPool.query(
		`
			INSERT INTO payroll_transactions (
				id,
				employee_name,
				source_amount,
				source_currency,
				destination_amount,
				destination_currency,
				destination_pointer,
				quote_id,
				payment_id,
				status,
				splits_json,
				distribution_json,
				created_at
			)
			VALUES (
				$1,
				$2,
				$3,
				$4,
				$5,
				$6,
				$7,
				$8,
				$9,
				$10,
				$11::jsonb,
				$12::jsonb,
				$13::timestamptz
			)
			ON CONFLICT (id) DO NOTHING
		`,
		[
			record.id,
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

export const getRecentPayrollRuns = async (limit = 20): Promise<PayrollRunRecord[]> => {
	const dbPool = getPool();
	if (!dbPool) {
		return localStore.slice(0, limit);
	}

	const result = await dbPool.query(
		`
			SELECT *
			FROM payroll_transactions
			ORDER BY created_at DESC
			LIMIT $1
		`,
		[limit]
	);

	return result.rows.map((row) => ({
		id: row.id,
		employeeName: row.employee_name,
		sourceAmount: Number(row.source_amount),
		sourceCurrency: row.source_currency,
		destinationAmount: Number(row.destination_amount),
		destinationCurrency: row.destination_currency,
		destinationPointer: row.destination_pointer,
		quoteId: row.quote_id,
		paymentId: row.payment_id,
		status: row.status,
		splits: row.splits_json,
		distributionResults: row.distribution_json,
		createdAt: row.created_at.toISOString(),
	}));
};
