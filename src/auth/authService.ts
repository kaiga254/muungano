import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { query, withTransaction } from "@/lib/db";
import { env } from "@/config/env";
import { ConflictError, NotFoundError, UnauthorizedError } from "@/src/shared/errors";

export type User = {
	id: string;
	email: string;
	phone: string;
	fullName: string;
	country: string;
	ilpAddress: string | null;
	kycTier: number;
	phoneVerified: boolean;
	isActive: boolean;
	createdAt: string;
};

export type SessionPayload = {
	userId: string;
	email: string;
	phone: string;
	fullName: string;
	country: string;
	ilpAddress: string | null;
	kycTier: number;
	phoneVerified: boolean;
};

const SALT_ROUNDS = 12;

// ── Registration ──────────────────────────────────────────────

export const register = async (input: {
	fullName: string;
	email: string;
	phone: string;
	password: string;
	country: string;
}): Promise<User> => {
	const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
	const userId = randomUUID();
	// ILP address derived from user ID: g.muungano.<short-uuid>
	const ilpAddress = `${env.ilpDomain}.${userId.replace(/-/g, "").slice(0, 16)}`;

	return withTransaction(async (client) => {
		const emailCheck = await client.query<{ id: string }>(
			"SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
			[input.email]
		);
		if ((emailCheck.rowCount ?? 0) > 0) {
			throw new ConflictError("An account with that email address already exists.");
		}

		const phoneCheck = await client.query<{ id: string }>(
			"SELECT id FROM users WHERE phone = $1",
			[input.phone]
		);
		if ((phoneCheck.rowCount ?? 0) > 0) {
			throw new ConflictError("An account with that phone number already exists.");
		}

		const result = await client.query<{
			id: string;
			email: string;
			phone: string;
			full_name: string;
			country: string;
			ilp_address: string;
			kyc_tier: number;
			phone_verified: boolean;
			is_active: boolean;
			created_at: string;
		}>(
			`INSERT INTO users
				(id, email, phone, password_hash, full_name, country, ilp_address)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)
			 RETURNING *`,
			[userId, input.email.toLowerCase(), input.phone, passwordHash, input.fullName, input.country, ilpAddress]
		);

		const row = result.rows[0];
		return mapUser(row);
	});
};

// ── Login ──────────────────────────────────────────────────────

export const logIn = async (
	email: string,
	password: string
): Promise<{ session: SessionPayload; token: string }> => {
	const rows = await query<{
		id: string;
		email: string;
		phone: string;
		full_name: string;
		country: string;
		ilp_address: string | null;
		kyc_tier: number;
		phone_verified: boolean;
		is_active: boolean;
		password_hash: string;
	}>(
		`SELECT id, email, phone, full_name, country, ilp_address, kyc_tier,
		        phone_verified, is_active, password_hash
		 FROM   users
		 WHERE  LOWER(email) = LOWER($1)`,
		[email]
	);

	const user = rows[0];
	if (!user) {
		throw new UnauthorizedError("Invalid email or password.");
	}

	if (!user.is_active) {
		throw new UnauthorizedError("Your account has been deactivated.");
	}

	const passwordMatch = await bcrypt.compare(password, user.password_hash);
	if (!passwordMatch) {
		throw new UnauthorizedError("Invalid email or password.");
	}

	// Opaque session token — two UUID4s joined
	const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, "");
	const expiresAt = new Date(Date.now() + env.sessionTtlSeconds * 1000);

	await query(
		`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
		[token, user.id, expiresAt.toISOString()]
	);

	const session: SessionPayload = {
		userId: user.id,
		email: user.email,
		phone: user.phone,
		fullName: user.full_name,
		country: user.country,
		ilpAddress: user.ilp_address,
		kycTier: user.kyc_tier,
		phoneVerified: user.phone_verified,
	};

	return { session, token };
};

// ── Session resolution ────────────────────────────────────────

export const resolveSession = async (token: string): Promise<SessionPayload | null> => {
	const rows = await query<{
		user_id: string;
		email: string;
		phone: string;
		full_name: string;
		country: string;
		ilp_address: string | null;
		kyc_tier: number;
		phone_verified: boolean;
		is_active: boolean;
		expires_at: string;
	}>(
		`SELECT s.user_id, u.email, u.phone, u.full_name, u.country, u.ilp_address,
		        u.kyc_tier, u.phone_verified, u.is_active, s.expires_at
		 FROM   sessions s
		 JOIN   users u ON u.id = s.user_id
		 WHERE  s.token = $1
		   AND  s.expires_at > NOW()`,
		[token]
	);

	const row = rows[0];
	if (!row || !row.is_active) return null;

	return {
		userId: row.user_id,
		email: row.email,
		phone: row.phone,
		fullName: row.full_name,
		country: row.country,
		ilpAddress: row.ilp_address,
		kycTier: row.kyc_tier,
		phoneVerified: row.phone_verified,
	};
};

// ── Logout ────────────────────────────────────────────────────

export const deleteSession = async (token: string): Promise<void> => {
	await query("DELETE FROM sessions WHERE token = $1", [token]);
};

export const purgeExpiredSessions = async (): Promise<void> => {
	await query("DELETE FROM sessions WHERE expires_at <= NOW()");
};

// ── User Fetch ────────────────────────────────────────────────

export const getUserById = async (id: string): Promise<User | null> => {
	const rows = await query<{
		id: string;
		email: string;
		phone: string;
		full_name: string;
		country: string;
		ilp_address: string | null;
		kyc_tier: number;
		phone_verified: boolean;
		is_active: boolean;
		created_at: string;
	}>("SELECT * FROM users WHERE id = $1", [id]);

	const row = rows[0];
	return row ? mapUser(row) : null;
};

// ── Phone Verification ────────────────────────────────────────

export const markPhoneVerified = async (userId: string): Promise<void> => {
	await query("UPDATE users SET phone_verified = TRUE WHERE id = $1", [userId]);
};

// ── Internal mapper ───────────────────────────────────────────

function mapUser(row: {
	id: string;
	email: string;
	phone: string;
	full_name: string;
	country: string;
	ilp_address: string | null;
	kyc_tier: number;
	phone_verified: boolean;
	is_active: boolean;
	created_at: string;
}): User {
	return {
		id: row.id,
		email: row.email,
		phone: row.phone,
		fullName: row.full_name,
		country: row.country,
		ilpAddress: row.ilp_address,
		kycTier: row.kyc_tier,
		phoneVerified: row.phone_verified,
		isActive: row.is_active,
		createdAt: row.created_at,
	};
}
