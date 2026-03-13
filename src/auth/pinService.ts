import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { PinError, NotFoundError } from "@/src/shared/errors";

const PIN_SALT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;

export const setPin = async (userId: string, pin: string): Promise<void> => {
	const pinHash = await bcrypt.hash(pin, PIN_SALT_ROUNDS);
	await query("UPDATE users SET pin_hash = $1 WHERE id = $2", [pinHash, userId]);
};

export const verifyPin = async (userId: string, pin: string): Promise<void> => {
	const rows = await query<{ pin_hash: string | null; is_active: boolean }>(
		"SELECT pin_hash, is_active FROM users WHERE id = $1",
		[userId]
	);

	const user = rows[0];
	if (!user) {
		throw new NotFoundError("User");
	}

	if (!user.pin_hash) {
		throw new PinError("Transaction PIN not set. Please set a PIN before proceeding.");
	}

	const match = await bcrypt.compare(pin, user.pin_hash);
	if (!match) {
		throw new PinError("Incorrect PIN.");
	}
};

export const hasPin = async (userId: string): Promise<boolean> => {
	const rows = await query<{ pin_hash: string | null }>(
		"SELECT pin_hash FROM users WHERE id = $1",
		[userId]
	);
	return !!rows[0]?.pin_hash;
};
