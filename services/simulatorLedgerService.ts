import { randomUUID } from "crypto";
import { withTransaction, query } from "@/lib/db";

export type SimulatorRail = "mpesa" | "bank" | "sacco" | "insurance";
export type LedgerDirection = "credit" | "debit";

export type SimulatorAccount = {
	id: string;
	companyId: string;
	employeeId: string;
	employeeName: string;
	rail: SimulatorRail;
	accountRef: string;
	currency: string;
	currentBalance: number;
	updatedAt: string;
};

export type SimulatorTransaction = {
	id: string;
	accountId: string;
	employeeId: string;
	employeeName: string;
	rail: SimulatorRail;
	direction: LedgerDirection;
	amount: number;
	currency: string;
	reference: string;
	narration: string | null;
	balanceBefore: number;
	balanceAfter: number;
	createdAt: string;
	metadata: Record<string, unknown>;
};

const asIsoString = (value: unknown): string => {
	if (value instanceof Date) {
		return value.toISOString();
	}
	return String(value);
};

const mapAccount = (row: Record<string, unknown>): SimulatorAccount => ({
	id: row.id as string,
	companyId: row.company_id as string,
	employeeId: row.employee_id as string,
	employeeName: row.employee_name as string,
	rail: row.rail as SimulatorRail,
	accountRef: row.account_ref as string,
	currency: row.currency as string,
	currentBalance: Number(row.current_balance),
	updatedAt: asIsoString(row.updated_at),
});

const mapTransaction = (row: Record<string, unknown>): SimulatorTransaction => ({
	id: row.id as string,
	accountId: row.account_id as string,
	employeeId: row.employee_id as string,
	employeeName: row.employee_name as string,
	rail: row.rail as SimulatorRail,
	direction: row.direction as LedgerDirection,
	amount: Number(row.amount),
	currency: row.currency as string,
	reference: row.reference as string,
	narration: (row.narration as string | null) ?? null,
	balanceBefore: Number(row.balance_before),
	balanceAfter: Number(row.balance_after),
	createdAt: asIsoString(row.created_at),
	metadata: (row.metadata_json as Record<string, unknown>) ?? {},
});

const accountReference = (rail: SimulatorRail, employeeNumber: string | null, employeeId: string): string => {
	if (employeeNumber) {
		return `${rail}-${employeeNumber}`;
	}

	return `${rail}-${employeeId.slice(0, 8)}`;
};

export const listRailAccounts = async (
	companyId: string,
	rail: SimulatorRail
): Promise<SimulatorAccount[]> => {
	const missingRows = await query<{ id: string; employee_number: string | null }>(
		`SELECT e.id, e.employee_number
		 FROM employees e
		 LEFT JOIN simulator_accounts sa
			ON sa.company_id = e.company_id
		   AND sa.employee_id = e.id
		   AND sa.rail = $2
		   AND sa.currency = 'KES'
		 WHERE e.company_id = $1
		   AND e.is_active = TRUE
		   AND sa.id IS NULL`,
		[companyId, rail]
	);

	for (const row of missingRows) {
		await query(
			`INSERT INTO simulator_accounts (
				id, company_id, employee_id, rail, account_ref, currency, current_balance
			 ) VALUES ($1, $2, $3, $4, $5, 'KES', 0)
			 ON CONFLICT (company_id, employee_id, rail, currency) DO NOTHING`,
			[
				randomUUID(),
				companyId,
				row.id,
				rail,
				accountReference(rail, row.employee_number, row.id),
			]
		);
	}

	const rows = await query<Record<string, unknown>>(
		`SELECT sa.*, e.full_name AS employee_name
		 FROM simulator_accounts sa
		 JOIN employees e ON e.id = sa.employee_id
		 WHERE sa.company_id = $1 AND sa.rail = $2 AND e.is_active = TRUE
		 ORDER BY e.full_name ASC`,
		[companyId, rail]
	);

	return rows.map(mapAccount);
};

export const listAccountTransactions = async (
	companyId: string,
	accountId: string,
	limit = 30
): Promise<SimulatorTransaction[]> => {
	const rows = await query<Record<string, unknown>>(
		`SELECT st.*, e.full_name AS employee_name
		 FROM simulator_transactions st
		 JOIN employees e ON e.id = st.employee_id
		 WHERE st.company_id = $1 AND st.account_id = $2
		 ORDER BY st.created_at DESC
		 LIMIT $3`,
		[companyId, accountId, limit]
	);

	return rows.map(mapTransaction);
};

export const postLedgerTransaction = async (input: {
	companyId: string;
	employeeId: string;
	rail: SimulatorRail;
	direction: LedgerDirection;
	amount: number;
	currency: string;
	reference: string;
	narration?: string;
	metadata?: Record<string, unknown>;
	createdBy?: string;
}): Promise<SimulatorTransaction> => {
	if (!Number.isFinite(input.amount) || input.amount <= 0) {
		throw new Error("Amount must be greater than zero.");
	}

	return withTransaction(async (client) => {
		const employeeResult = await client.query(
			`SELECT id, full_name, employee_number
			 FROM employees
			 WHERE id = $1 AND company_id = $2`,
			[input.employeeId, input.companyId]
		);

		if (!employeeResult.rowCount) {
			throw new Error("Employee not found for simulator posting.");
		}

		const employee = employeeResult.rows[0] as {
			id: string;
			full_name: string;
			employee_number: string | null;
		};

		let accountResult = await client.query(
			`SELECT *
			 FROM simulator_accounts
			 WHERE company_id = $1 AND employee_id = $2 AND rail = $3 AND currency = $4
			 FOR UPDATE`,
			[input.companyId, input.employeeId, input.rail, input.currency]
		);

		if (!accountResult.rowCount) {
			const created = await client.query(
				`INSERT INTO simulator_accounts (
					id, company_id, employee_id, rail, account_ref, currency, current_balance
				 ) VALUES ($1, $2, $3, $4, $5, $6, 0)
				 RETURNING *`,
				[
					randomUUID(),
					input.companyId,
					input.employeeId,
					input.rail,
					accountReference(input.rail, employee.employee_number, employee.id),
					input.currency,
				]
			);

			accountResult = await client.query(
				`SELECT *
				 FROM simulator_accounts
				 WHERE id = $1
				 FOR UPDATE`,
				[created.rows[0].id]
			);
		}

		const account = accountResult.rows[0] as {
			id: string;
			current_balance: string;
		};

		const balanceBefore = Number(account.current_balance);
		const signedAmount = input.direction === "debit" ? -input.amount : input.amount;
		const balanceAfter = Number((balanceBefore + signedAmount).toFixed(2));

		if (balanceAfter < 0) {
			throw new Error("Insufficient simulator balance for debit transaction.");
		}

		const existingReference = await client.query(
			`SELECT id
			 FROM simulator_transactions
			 WHERE company_id = $1 AND reference = $2`,
			[input.companyId, input.reference]
		);

		if (existingReference.rowCount) {
			const txRows = await client.query(
				`SELECT st.*, e.full_name AS employee_name
				 FROM simulator_transactions st
				 JOIN employees e ON e.id = st.employee_id
				 WHERE st.id = $1`,
				[existingReference.rows[0].id]
			);

			return mapTransaction(txRows.rows[0] as Record<string, unknown>);
		}

		const txId = randomUUID();

		await client.query(
			`INSERT INTO simulator_transactions (
				id, company_id, account_id, employee_id, rail, direction,
				amount, currency, reference, narration, balance_before,
				balance_after, metadata_json, created_by
			 ) VALUES (
				$1, $2, $3, $4, $5, $6,
				$7, $8, $9, $10, $11,
				$12, $13::jsonb, $14
			 )`,
			[
				txId,
				input.companyId,
				account.id,
				input.employeeId,
				input.rail,
				input.direction,
				input.amount,
				input.currency,
				input.reference,
				input.narration ?? null,
				balanceBefore,
				balanceAfter,
				JSON.stringify(input.metadata ?? {}),
				input.createdBy ?? null,
			]
		);

		await client.query(
			`UPDATE simulator_accounts
			 SET current_balance = $1,
			     updated_at = NOW()
			 WHERE id = $2`,
			[balanceAfter, account.id]
		);

		const txRows = await client.query(
			`SELECT st.*, e.full_name AS employee_name
			 FROM simulator_transactions st
			 JOIN employees e ON e.id = st.employee_id
			 WHERE st.id = $1`,
			[txId]
		);

		return mapTransaction(txRows.rows[0] as Record<string, unknown>);
	});
};
