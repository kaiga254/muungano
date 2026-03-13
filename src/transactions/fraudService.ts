import { randomUUID } from "crypto";
import { query } from "@/lib/db";

export type FraudEventType =
	| "large_transfer"
	| "failed_pin_attempts"
	| "unusual_location"
	| "rapid_sends";

export type FraudEvent = {
	id: string;
	userId: string;
	eventType: FraudEventType;
	details: Record<string, unknown>;
	createdAt: string;
};

export const logFraudEvent = async (
	userId: string,
	eventType: FraudEventType,
	details: Record<string, unknown>
): Promise<void> => {
	await query(
		`INSERT INTO fraud_events (id, user_id, event_type, details_json)
		 VALUES ($1, $2, $3, $4)`,
		[randomUUID(), userId, eventType, JSON.stringify(details)]
	);
	// In production: alert risk team, trigger review queue, etc.
	console.warn(`[FRAUD_EVENT] user=${userId} type=${eventType}`, details);
};

export const getFraudEvents = async (
	userId: string,
	limit = 50
): Promise<FraudEvent[]> => {
	const rows = await query<{
		id: string;
		user_id: string;
		event_type: FraudEventType;
		details_json: Record<string, unknown>;
		created_at: string;
	}>(
		`SELECT * FROM fraud_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
		[userId, limit]
	);

	return rows.map((r) => ({
		id: r.id,
		userId: r.user_id,
		eventType: r.event_type,
		details: r.details_json,
		createdAt: r.created_at,
	}));
};
