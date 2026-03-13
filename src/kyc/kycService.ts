import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/src/shared/errors";

export type KycProfile = {
	id: string;
	userId: string;
	fullName: string;
	nationalId: string;
	dateOfBirth: string;
	country: string;
	status: "pending" | "verified" | "rejected";
	verifiedAt: string | null;
	createdAt: string;
};

export const submitKyc = async (input: {
	userId: string;
	fullName: string;
	nationalId: string;
	dateOfBirth: string;
	country: string;
}): Promise<KycProfile> => {
	// Check for existing submission
	const existing = await query<{ id: string; status: string }>(
		"SELECT id, status FROM kyc_profiles WHERE user_id = $1",
		[input.userId]
	);

	if (existing.length > 0) {
		const profile = existing[0];
		if (profile.status === "verified") {
			throw new ConflictError("KYC is already verified.");
		}
		if (profile.status === "pending") {
			throw new ConflictError("A KYC submission is already pending review.");
		}
		// rejected — allow resubmission by updating
		await query(
			`UPDATE kyc_profiles
			 SET full_name = $1, national_id = $2, date_of_birth = $3,
			     country = $4, status = 'pending', verified_at = NULL,
			     updated_at = NOW()
			 WHERE user_id = $5`,
			[input.fullName, input.nationalId, input.dateOfBirth, input.country, input.userId]
		);
		return getKycByUserId(input.userId) as Promise<KycProfile>;
	}

	const id = randomUUID();
	const rows = await query<{
		id: string;
		user_id: string;
		full_name: string;
		national_id: string;
		date_of_birth: string;
		country: string;
		status: "pending" | "verified" | "rejected";
		verified_at: string | null;
		created_at: string;
	}>(
		`INSERT INTO kyc_profiles
			(id, user_id, full_name, national_id, date_of_birth, country)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING *`,
		[id, input.userId, input.fullName, input.nationalId, input.dateOfBirth, input.country]
	);

	return mapKyc(rows[0]);
};

export const getKycByUserId = async (userId: string): Promise<KycProfile | null> => {
	const rows = await query<{
		id: string;
		user_id: string;
		full_name: string;
		national_id: string;
		date_of_birth: string;
		country: string;
		status: "pending" | "verified" | "rejected";
		verified_at: string | null;
		created_at: string;
	}>("SELECT * FROM kyc_profiles WHERE user_id = $1", [userId]);

	return rows[0] ? mapKyc(rows[0]) : null;
};

/** Mock verification — marks profile as verified and upgrades user kyc_tier to 1. */
export const verifyKyc = async (userId: string): Promise<KycProfile> => {
	const existing = await getKycByUserId(userId);
	if (!existing) {
		throw new NotFoundError("KYC profile");
	}

	await query(
		`UPDATE kyc_profiles
		 SET status = 'verified', verified_at = NOW(), updated_at = NOW()
		 WHERE user_id = $1`,
		[userId]
	);

	await query("UPDATE users SET kyc_tier = 1 WHERE id = $1", [userId]);

	return { ...existing, status: "verified", verifiedAt: new Date().toISOString() };
};

export const rejectKyc = async (userId: string): Promise<void> => {
	await query(
		"UPDATE kyc_profiles SET status = 'rejected', updated_at = NOW() WHERE user_id = $1",
		[userId]
	);
};

function mapKyc(row: {
	id: string;
	user_id: string;
	full_name: string;
	national_id: string;
	date_of_birth: string;
	country: string;
	status: "pending" | "verified" | "rejected";
	verified_at: string | null;
	created_at: string;
}): KycProfile {
	return {
		id: row.id,
		userId: row.user_id,
		fullName: row.full_name,
		nationalId: row.national_id,
		dateOfBirth: row.date_of_birth,
		country: row.country,
		status: row.status,
		verifiedAt: row.verified_at,
		createdAt: row.created_at,
	};
}
