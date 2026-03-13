import { randomUUID } from "crypto";
import { type PoolClient } from "pg";
import { query, withTransaction } from "@/lib/db";
import {
	DEFAULT_SPLIT_RULES,
	type SplitRule,
} from "@/services/payrollService";

export type Employee = {
	id: string;
	companyId: string;
	employeeNumber: string | null;
	fullName: string;
	email: string | null;
	phone: string | null;
	department: string | null;
	jobTitle: string | null;
	employmentType: string;
	country: string;
	salaryAmount: number;
	salaryCurrency: string;
	destinationPointer: string;
	nationalId: string | null;
	kraPin: string | null;
	nhifNumber: string | null;
	nssfNumber: string | null;
	tpin: string | null;
	isActive: boolean;
	startDate: string | null;
	endDate: string | null;
	splitRules: SplitRule[];
	createdAt: string;
	updatedAt: string;
};

export type CreateEmployeeInput = Omit<
	Employee,
	"id" | "companyId" | "isActive" | "splitRules" | "createdAt" | "updatedAt"
> & {
	splitRules?: SplitRule[];
	createdBy: string;
};

export type UpdateEmployeeInput = Partial<
	Omit<Employee, "id" | "companyId" | "createdAt" | "updatedAt" | "splitRules">
> & {
	splitRules?: SplitRule[];
};

// ---------------------------------------------------------------
// Map a DB row to the Employee domain type
// ---------------------------------------------------------------
const mapRow = (row: Record<string, unknown>, rules: SplitRule[]): Employee => ({
	id: row.id as string,
	companyId: row.company_id as string,
	employeeNumber: (row.employee_number ?? null) as string | null,
	fullName: row.full_name as string,
	email: (row.email ?? null) as string | null,
	phone: (row.phone ?? null) as string | null,
	department: (row.department ?? null) as string | null,
	jobTitle: (row.job_title ?? null) as string | null,
	employmentType: row.employment_type as string,
	country: row.country as string,
	salaryAmount: Number(row.salary_amount),
	salaryCurrency: row.salary_currency as string,
	destinationPointer: row.destination_pointer as string,
	nationalId: (row.national_id ?? null) as string | null,
	kraPin: (row.kra_pin ?? null) as string | null,
	nhifNumber: (row.nhif_number ?? null) as string | null,
	nssfNumber: (row.nssf_number ?? null) as string | null,
	tpin: (row.tpin ?? null) as string | null,
	isActive: row.is_active as boolean,
	startDate: row.start_date
		? (row.start_date as Date).toISOString?.().split("T")[0] ??
		  String(row.start_date)
		: null,
	endDate: row.end_date
		? (row.end_date as Date).toISOString?.().split("T")[0] ??
		  String(row.end_date)
		: null,
	splitRules: rules,
	createdAt:
		(row.created_at as Date).toISOString?.() ?? String(row.created_at),
	updatedAt:
		(row.updated_at as Date).toISOString?.() ?? String(row.updated_at),
});

// ---------------------------------------------------------------
// Load split rules for an employee (falls back to global defaults)
// ---------------------------------------------------------------
const loadSplitRules = async (employeeId: string): Promise<SplitRule[]> => {
	const rows = await query<{
		split_key: string;
		label: string;
		percentage: string;
	}>(
		`SELECT split_key, label, percentage
		 FROM employee_split_rules
		 WHERE employee_id = $1
		 ORDER BY split_key`,
		[employeeId]
	);

	if (!rows.length) {
		return DEFAULT_SPLIT_RULES;
	}

	return rows.map((r) => ({
		key: r.split_key as SplitRule["key"],
		label: r.label,
		percentage: Number(r.percentage),
	}));
};

// ---------------------------------------------------------------
// Persist split rules for an employee (upsert)
// ---------------------------------------------------------------
const saveSplitRules = async (
	client: PoolClient,
	employeeId: string,
	rules: SplitRule[]
): Promise<void> => {
	const total = rules.reduce((sum, r) => sum + r.percentage, 0);
	if (Math.round(total * 100) !== 10000) {
		throw new Error(
			`Split percentages must total 100%. Current total: ${total}%`
		);
	}

	// Remove old rules first
	await client.query(
		"DELETE FROM employee_split_rules WHERE employee_id = $1",
		[employeeId]
	);

	for (const rule of rules) {
		await client.query(
			`INSERT INTO employee_split_rules (id, employee_id, split_key, label, percentage)
			 VALUES ($1, $2, $3, $4, $5)`,
			[randomUUID(), employeeId, rule.key, rule.label, rule.percentage]
		);
	}
};

// ---------------------------------------------------------------
// List employees for a company
// ---------------------------------------------------------------
export const listEmployees = async (
	companyId: string,
	options?: { activeOnly?: boolean }
): Promise<Employee[]> => {
	const whereClause =
		options?.activeOnly === false
			? "WHERE e.company_id = $1"
			: "WHERE e.company_id = $1 AND e.is_active = TRUE";

	const rows = await query<Record<string, unknown>>(
		`SELECT * FROM employees e ${whereClause} ORDER BY e.full_name ASC`,
		[companyId]
	);

	return Promise.all(
		rows.map(async (row) => {
			const rules = await loadSplitRules(row.id as string);
			return mapRow(row, rules);
		})
	);
};

// ---------------------------------------------------------------
// Get a single employee by id (scoped to company for security)
// ---------------------------------------------------------------
export const getEmployee = async (
	id: string,
	companyId: string
): Promise<Employee | null> => {
	const rows = await query<Record<string, unknown>>(
		"SELECT * FROM employees WHERE id = $1 AND company_id = $2",
		[id, companyId]
	);

	if (!rows.length) {
		return null;
	}

	const rules = await loadSplitRules(id);
	return mapRow(rows[0], rules);
};

// ---------------------------------------------------------------
// Create employee
// ---------------------------------------------------------------
export const createEmployee = async (
	companyId: string,
	input: CreateEmployeeInput
): Promise<Employee> => {
	const id = randomUUID();
	const rules = input.splitRules ?? DEFAULT_SPLIT_RULES;

	return withTransaction(async (client) => {
		// Check duplicate employee number
		if (input.employeeNumber) {
			const dup = await client.query(
				`SELECT id FROM employees
				 WHERE company_id = $1 AND employee_number = $2`,
				[companyId, input.employeeNumber]
			);
			if ((dup.rowCount ?? 0) > 0) {
				throw new Error(
					`Employee number "${input.employeeNumber}" is already in use.`
				);
			}
		}

		const result = await client.query(
			`INSERT INTO employees (
				id, company_id, employee_number, full_name, email, phone,
				department, job_title, employment_type, country,
				salary_amount, salary_currency, destination_pointer,
				national_id, kra_pin, nhif_number, nssf_number, tpin,
				is_active, start_date, end_date, created_by
			) VALUES (
				$1, $2, $3, $4, $5, $6,
				$7, $8, $9, $10,
				$11, $12, $13,
				$14, $15, $16, $17, $18,
				TRUE, $19, $20, $21
			)
			RETURNING *`,
			[
				id,
				companyId,
				input.employeeNumber || null,
				input.fullName,
				input.email || null,
				input.phone || null,
				input.department || null,
				input.jobTitle || null,
				input.employmentType || "full_time",
				input.country || "KE",
				input.salaryAmount,
				input.salaryCurrency || "MWK",
				input.destinationPointer,
				input.nationalId || null,
				input.kraPin || null,
				input.nhifNumber || null,
				input.nssfNumber || null,
				input.tpin || null,
				input.startDate || null,
				input.endDate || null,
				input.createdBy,
			]
		);

		await saveSplitRules(client, id, rules);

		return mapRow(result.rows[0], rules);
	});
};

// ---------------------------------------------------------------
// Update employee
// ---------------------------------------------------------------
export const updateEmployee = async (
	id: string,
	companyId: string,
	input: UpdateEmployeeInput
): Promise<Employee> => {
	return withTransaction(async (client) => {
		const existing = await client.query(
			"SELECT id FROM employees WHERE id = $1 AND company_id = $2",
			[id, companyId]
		);
		if (!(existing.rowCount ?? 0)) {
			throw new Error("Employee not found.");
		}

		// Check duplicate employee number (if changed)
		if (input.employeeNumber !== undefined && input.employeeNumber) {
			const dup = await client.query(
				`SELECT id FROM employees
				 WHERE company_id = $1 AND employee_number = $2 AND id != $3`,
				[companyId, input.employeeNumber, id]
			);
			if ((dup.rowCount ?? 0) > 0) {
				throw new Error(
					`Employee number "${input.employeeNumber}" is already in use.`
				);
			}
		}

		const result = await client.query(
			`UPDATE employees SET
				employee_number   = COALESCE($1, employee_number),
				full_name         = COALESCE($2, full_name),
				email             = COALESCE($3, email),
				phone             = COALESCE($4, phone),
				department        = COALESCE($5, department),
				job_title         = COALESCE($6, job_title),
				employment_type   = COALESCE($7, employment_type),
				country           = COALESCE($8, country),
				salary_amount     = COALESCE($9, salary_amount),
				salary_currency   = COALESCE($10, salary_currency),
				destination_pointer = COALESCE($11, destination_pointer),
				national_id       = COALESCE($12, national_id),
				kra_pin           = COALESCE($13, kra_pin),
				nhif_number       = COALESCE($14, nhif_number),
				nssf_number       = COALESCE($15, nssf_number),
				tpin              = COALESCE($16, tpin),
				is_active         = COALESCE($17, is_active),
				start_date        = COALESCE($18, start_date),
				end_date          = COALESCE($19, end_date),
				updated_at        = NOW()
			WHERE id = $20 AND company_id = $21
			RETURNING *`,
			[
				input.employeeNumber ?? null,
				input.fullName ?? null,
				input.email ?? null,
				input.phone ?? null,
				input.department ?? null,
				input.jobTitle ?? null,
				input.employmentType ?? null,
				input.country ?? null,
				input.salaryAmount ?? null,
				input.salaryCurrency ?? null,
				input.destinationPointer ?? null,
				input.nationalId ?? null,
				input.kraPin ?? null,
				input.nhifNumber ?? null,
				input.nssfNumber ?? null,
				input.tpin ?? null,
				input.isActive ?? null,
				input.startDate ?? null,
				input.endDate ?? null,
				id,
				companyId,
			]
		);

		if (input.splitRules) {
			await saveSplitRules(client, id, input.splitRules);
		}

		const rules = input.splitRules ?? (await loadSplitRules(id));
		return mapRow(result.rows[0], rules);
	});
};

// ---------------------------------------------------------------
// Soft-delete (deactivate)
// ---------------------------------------------------------------
export const deactivateEmployee = async (
	id: string,
	companyId: string
): Promise<void> => {
	const rows = await query(
		`UPDATE employees SET is_active = FALSE, updated_at = NOW()
		 WHERE id = $1 AND company_id = $2`,
		[id, companyId]
	);

	if (!Array.isArray(rows)) {
		throw new Error("Employee not found or already deactivated.");
	}
};
