import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { query, withTransaction } from "@/lib/db";
import { env } from "@/config/env";

export type Company = {
	id: string;
	name: string;
	country: string;
	currency: string;
	createdAt: string;
};

export type User = {
	id: string;
	companyId: string;
	email: string;
	fullName: string;
	role: string;
	isActive: boolean;
	createdAt: string;
};

export type SessionPayload = {
	userId: string;
	companyId: string;
	email: string;
	fullName: string;
	role: string;
	companyName: string;
};

const SALT_ROUNDS = 12;

// ---------------------------------------------------------------
// Sign up — creates company + owner user in one transaction
// ---------------------------------------------------------------
export const signUp = async (input: {
	companyName: string;
	companyCountry: string;
	companyCurrency: string;
	fullName: string;
	email: string;
	password: string;
}): Promise<{ user: User; company: Company }> => {
	const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
	const companyId = randomUUID();
	const userId = randomUUID();

	return withTransaction(async (client) => {
		// Check email uniqueness before inserting
		const existing = await client.query(
			"SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
			[input.email]
		);
		if ((existing.rowCount ?? 0) > 0) {
			throw new Error("An account with that email address already exists.");
		}

		const companyResult = await client.query(
			`INSERT INTO companies (id, name, country, currency)
			 VALUES ($1, $2, $3, $4)
			 RETURNING id, name, country, currency, created_at`,
			[companyId, input.companyName, input.companyCountry, input.companyCurrency]
		);

		const userResult = await client.query(
			`INSERT INTO users (id, company_id, email, password_hash, full_name, role)
			 VALUES ($1, $2, $3, $4, $5, 'hr_admin')
			 RETURNING id, company_id, email, full_name, role, is_active, created_at`,
			[userId, companyId, input.email.toLowerCase(), passwordHash, input.fullName]
		);

		const company = companyResult.rows[0];
		const user = userResult.rows[0];

		return {
			company: {
				id: company.id,
				name: company.name,
				country: company.country,
				currency: company.currency,
				createdAt: company.created_at.toISOString?.() ?? String(company.created_at),
			},
			user: {
				id: user.id,
				companyId: user.company_id,
				email: user.email,
				fullName: user.full_name,
				role: user.role,
				isActive: user.is_active,
				createdAt: user.created_at.toISOString?.() ?? String(user.created_at),
			},
		};
	});
};

// ---------------------------------------------------------------
// Log in — verify credentials, create session token
// ---------------------------------------------------------------
export const logIn = async (
	email: string,
	password: string
): Promise<{ token: string; payload: SessionPayload }> => {
	const rows = await query<{
		id: string;
		company_id: string;
		email: string;
		password_hash: string;
		full_name: string;
		role: string;
		is_active: boolean;
		company_name: string;
	}>(
		`SELECT u.id, u.company_id, u.email, u.password_hash,
		        u.full_name, u.role, u.is_active, c.name AS company_name
		 FROM users u
		 JOIN companies c ON c.id = u.company_id
		 WHERE LOWER(u.email) = LOWER($1)`,
		[email]
	);

	if (!rows.length) {
		throw new Error("Invalid email or password.");
	}

	const user = rows[0];

	if (!user.is_active) {
		throw new Error("Your account has been deactivated. Contact your administrator.");
	}

	const valid = await bcrypt.compare(password, user.password_hash);
	if (!valid) {
		throw new Error("Invalid email or password.");
	}

	const token = randomUUID() + "-" + randomUUID();
	const expiresAt = new Date(Date.now() + env.sessionTtlSeconds * 1000).toISOString();

	await query(
		`INSERT INTO sessions (token, user_id, company_id, expires_at)
		 VALUES ($1, $2, $3, $4::timestamptz)`,
		[token, user.id, user.company_id, expiresAt]
	);

	return {
		token,
		payload: {
			userId: user.id,
			companyId: user.company_id,
			email: user.email,
			fullName: user.full_name,
			role: user.role,
			companyName: user.company_name,
		},
	};
};

// ---------------------------------------------------------------
// Resolve session token → session payload (used in middleware + APIs)
// ---------------------------------------------------------------
export const resolveSession = async (
	token: string
): Promise<SessionPayload | null> => {
	const rows = await query<{
		user_id: string;
		company_id: string;
		email: string;
		full_name: string;
		role: string;
		is_active: boolean;
		company_name: string;
	}>(
		`SELECT s.user_id, s.company_id, u.email, u.full_name, u.role,
		        u.is_active, c.name AS company_name
		 FROM sessions s
		 JOIN users u ON u.id = s.user_id
		 JOIN companies c ON c.id = s.company_id
		 WHERE s.token = $1
		   AND s.expires_at > NOW()`,
		[token]
	);

	if (!rows.length || !rows[0].is_active) {
		return null;
	}

	const row = rows[0];
	return {
		userId: row.user_id,
		companyId: row.company_id,
		email: row.email,
		fullName: row.full_name,
		role: row.role,
		companyName: row.company_name,
	};
};

// ---------------------------------------------------------------
// Delete session
// ---------------------------------------------------------------
export const deleteSession = async (token: string): Promise<void> => {
	await query("DELETE FROM sessions WHERE token = $1", [token]);
};

// ---------------------------------------------------------------
// Purge expired sessions (call periodically or on login)
// ---------------------------------------------------------------
export const purgeExpiredSessions = async (): Promise<void> => {
	await query("DELETE FROM sessions WHERE expires_at <= NOW()");
};
