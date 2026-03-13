import { randomUUID } from "crypto";
import { env } from "@/config/env";
import { buildRafikiUrl, rafikiConfig } from "@/config/rafiki";

// =============================================================
// Rafiki / Open Payments adapter (mock mode by default)
// =============================================================

export type IlpPaymentRequest = {
	quoteId: string;
	rafikiQuoteId: string | null;
	sourceAmount: bigint;
	sourceCurrency: string;
	destinationAmount: bigint;
	destinationCurrency: string;
	receiverIlpAddress: string;
};

export type IlpPaymentResult = {
	rafikiPaymentId: string;
	status: "COMPLETED" | "PENDING";
};

export type IlpIncomingPaymentResult = {
	id: string;
	ilpAddress: string;
};

// ── Auth helper ───────────────────────────────────────────────

const timeoutSignal = () => AbortSignal.timeout(env.requestTimeoutMs);

const getAuthHeader = async (): Promise<Record<string, string>> => {
	if (env.rafikiAuthToken) {
		return { Authorization: `Bearer ${env.rafikiAuthToken}` };
	}
	if (!env.rafikiClientId || !env.rafikiClientSecret) {
		return {};
	}
	const tokenUrl = buildRafikiUrl(rafikiConfig.sender.baseUrl, rafikiConfig.sender.tokenPath);
	const response = await fetch(tokenUrl, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "client_credentials",
			client_id: env.rafikiClientId,
			client_secret: env.rafikiClientSecret,
		}),
		signal: timeoutSignal(),
	});
	if (!response.ok) throw new Error(`Rafiki auth failed (${response.status})`);
	const payload = (await response.json()) as { access_token?: string };
	if (!payload.access_token) throw new Error("Rafiki token response missing access_token");
	return { Authorization: `Bearer ${payload.access_token}` };
};

// ── Public methods ────────────────────────────────────────────

/**
 * Create an ILP incoming payment on the receiver node.
 * In mock mode: returns a synthetic incoming payment ID.
 */
export const createIncomingPayment = async (
	receiverIlpAddress: string,
	amount: bigint,
	currency: string
): Promise<IlpIncomingPaymentResult> => {
	if (env.rafikiMockMode) {
		return {
			id: `incoming_mock_${randomUUID()}`,
			ilpAddress: receiverIlpAddress,
		};
	}

	const authHeaders = await getAuthHeader();
	const url = buildRafikiUrl(
		rafikiConfig.receiver.baseUrl,
		rafikiConfig.receiver.incomingPaymentPath
	);

	const res = await fetch(url, {
		method: "POST",
		headers: { ...authHeaders, "Content-Type": "application/json" },
		body: JSON.stringify({
			walletAddress: receiverIlpAddress,
			incomingAmount: { value: String(amount), assetCode: currency, assetScale: 2 },
		}),
		signal: timeoutSignal(),
	});

	if (!res.ok) throw new Error(`Failed to create incoming payment (${res.status})`);
	return (await res.json()) as IlpIncomingPaymentResult;
};

/**
 * Send an outgoing ILP payment from the sender node.
 * In mock mode: immediately returns COMPLETED.
 */
export const sendOutgoingPayment = async (
	req: IlpPaymentRequest
): Promise<IlpPaymentResult> => {
	if (env.rafikiMockMode) {
		return {
			rafikiPaymentId: `payment_mock_${randomUUID()}`,
			status: "COMPLETED",
		};
	}

	const authHeaders = await getAuthHeader();
	const url = buildRafikiUrl(
		rafikiConfig.sender.baseUrl,
		rafikiConfig.sender.outgoingPaymentPath
	);

	const res = await fetch(url, {
		method: "POST",
		headers: { ...authHeaders, "Content-Type": "application/json" },
		body: JSON.stringify({
			quoteId: req.rafikiQuoteId ?? req.quoteId,
			walletAddress: req.receiverIlpAddress,
		}),
		signal: timeoutSignal(),
	});

	if (!res.ok) throw new Error(`Failed to send outgoing payment (${res.status})`);
	const data = (await res.json()) as { id: string; state: string };
	return {
		rafikiPaymentId: data.id,
		status: data.state?.toUpperCase() === "COMPLETED" ? "COMPLETED" : "PENDING",
	};
};

/**
 * Poll payment status.
 * In mock mode: always returns COMPLETED.
 */
export const getPaymentStatus = async (
	rafikiPaymentId: string
): Promise<"COMPLETED" | "PENDING" | "FAILED"> => {
	if (env.rafikiMockMode) return "COMPLETED";

	const authHeaders = await getAuthHeader();
	const url = `${buildRafikiUrl(rafikiConfig.sender.baseUrl, rafikiConfig.sender.outgoingPaymentPath)}/${rafikiPaymentId}`;
	const res = await fetch(url, { headers: authHeaders, signal: timeoutSignal() });
	if (!res.ok) return "FAILED";
	const data = (await res.json()) as { state: string };
	const state = data.state?.toUpperCase();
	if (state === "COMPLETED") return "COMPLETED";
	if (state === "FAILED") return "FAILED";
	return "PENDING";
};
