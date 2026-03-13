import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/src/shared/errors";

const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
const OTP_SALT_ROUNDS = 10;

// In production this would send an actual SMS or email.
// For now it logs to console and returns the code for dev use.
const sendOtp = async (phone: string, code: string, purpose: string): Promise<void> => {
	console.log(`[OTP] Phone: ${phone} | Purpose: ${purpose} | Code: ${code}`);
	// TODO: integrate with SMS provider (Africa's Talking, Twilio, etc.)
};

export const generateOtp = async (
	userId: string,
	phone: string,
	purpose: "verify_phone" | "reset_pin"
): Promise<{ otpId: string; devCode: string }> => {
	// Generate 6-digit numeric code
	const code = String(Math.floor(100000 + Math.random() * 900000));
	const codeHash = await bcrypt.hash(code, OTP_SALT_ROUNDS);
	const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
	const otpId = randomUUID();

	await query(
		`INSERT INTO otps (id, user_id, code_hash, purpose, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		[otpId, userId, codeHash, purpose, expiresAt.toISOString()]
	);

	await sendOtp(phone, code, purpose);

	return { otpId, devCode: code };
};

export const verifyOtp = async (
	userId: string,
	code: string,
	purpose: "verify_phone" | "reset_pin"
): Promise<void> => {
	const rows = await query<{
		id: string;
		code_hash: string;
		expires_at: string;
		used_at: string | null;
	}>(
		`SELECT id, code_hash, expires_at, used_at
		 FROM   otps
		 WHERE  user_id = $1
		   AND  purpose = $2
		   AND  used_at IS NULL
		   AND  expires_at > NOW()
		 ORDER  BY created_at DESC
		 LIMIT  1`,
		[userId, purpose]
	);

	const otp = rows[0];
	if (!otp) {
		throw new ValidationError("No valid OTP found. Request a new one.");
	}

	const match = await bcrypt.compare(code, otp.code_hash);
	if (!match) {
		throw new ValidationError("Incorrect OTP code.");
	}

	// Mark as used
	await query("UPDATE otps SET used_at = NOW() WHERE id = $1", [otp.id]);
};
