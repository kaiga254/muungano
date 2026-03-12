import { randomUUID } from "crypto";
import { env } from "@/config/env";
import { buildRafikiUrl, rafikiConfig } from "@/config/rafiki";

export type QuoteRequest = {
	sourceAmount: number;
	sourceCurrency: string;
	destinationAmount: number;
	destinationCurrency: string;
	receiverWalletAddress: string;
};

export type QuoteResponse = {
	id: string;
	estimatedDestinationAmount: number;
	sourceAmount: number;
	exchangeRate: number;
	status: "COMPLETED" | "PENDING";
};

export type OutgoingPaymentRequest = {
	quoteId: string;
	destinationPointer: string;
	amount: number;
	currency: string;
};

export type OutgoingPaymentResponse = {
	id: string;
	status: "COMPLETED" | "PENDING";
	amount: number;
	currency: string;
	quoteId: string;
};

export type PaymentStatusResponse = {
	id: string;
	status: "COMPLETED" | "PENDING";
};

const timeoutSignal = () => {
	return AbortSignal.timeout(env.requestTimeoutMs);
};

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

	if (!response.ok) {
		throw new Error(`Unable to authenticate with Rafiki (${response.status})`);
	}

	const payload = (await response.json()) as { access_token?: string };
	if (!payload.access_token) {
		throw new Error("Rafiki token response missing access_token");
	}

	return { Authorization: `Bearer ${payload.access_token}` };
};

const createMockId = (prefix: string): string => {
	return `${prefix}_${randomUUID()}`;
};

export class RafikiService {
	async createQuote(request: QuoteRequest): Promise<QuoteResponse> {
		if (env.rafikiMockMode) {
			return {
				id: createMockId("quote"),
				estimatedDestinationAmount: request.destinationAmount,
				sourceAmount: request.sourceAmount,
				exchangeRate: request.destinationAmount / request.sourceAmount,
				status: "COMPLETED",
			};
		}

		const headers = await getAuthHeader();
		const response = await fetch(
			buildRafikiUrl(rafikiConfig.sender.baseUrl, rafikiConfig.sender.quotePath),
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Open-Payments-Version": rafikiConfig.openPaymentsVersion,
					...headers,
				},
				body: JSON.stringify({
					debitAmount: {
						value: request.sourceAmount.toFixed(2),
						assetCode: request.sourceCurrency,
						assetScale: 2,
					},
					receiveAmount: {
						value: request.destinationAmount.toFixed(2),
						assetCode: request.destinationCurrency,
						assetScale: 2,
					},
					receiver: request.receiverWalletAddress,
				}),
				signal: timeoutSignal(),
			}
		);

		if (!response.ok) {
			throw new Error(`Rafiki quote request failed (${response.status})`);
		}

		const payload = (await response.json()) as { id: string; debitAmount?: { value: string } };
		return {
			id: payload.id,
			estimatedDestinationAmount: request.destinationAmount,
			sourceAmount: Number(payload.debitAmount?.value ?? request.sourceAmount),
			exchangeRate: request.destinationAmount / request.sourceAmount,
			status: "COMPLETED",
		};
	}

	async createIncomingPayment(destinationPointer: string, amount: number, currency: string) {
		if (env.rafikiMockMode) {
			return {
				id: createMockId("incoming"),
				destinationPointer,
				amount,
				currency,
				status: "COMPLETED" as const,
			};
		}

		const headers = await getAuthHeader();
		const response = await fetch(
			buildRafikiUrl(rafikiConfig.receiver.baseUrl, rafikiConfig.receiver.incomingPaymentPath),
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Open-Payments-Version": rafikiConfig.openPaymentsVersion,
					...headers,
				},
				body: JSON.stringify({
					walletAddress: destinationPointer,
					incomingAmount: {
						value: amount.toFixed(2),
						assetCode: currency,
						assetScale: 2,
					},
				}),
				signal: timeoutSignal(),
			}
		);

		if (!response.ok) {
			throw new Error(`Rafiki incoming payment creation failed (${response.status})`);
		}

		return response.json();
	}

	async sendOutgoingPayment(request: OutgoingPaymentRequest): Promise<OutgoingPaymentResponse> {
		if (env.rafikiMockMode) {
			return {
				id: createMockId("outgoing"),
				status: "COMPLETED",
				amount: request.amount,
				currency: request.currency,
				quoteId: request.quoteId,
			};
		}

		const headers = await getAuthHeader();
		const response = await fetch(
			buildRafikiUrl(rafikiConfig.sender.baseUrl, rafikiConfig.sender.outgoingPaymentPath),
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Open-Payments-Version": rafikiConfig.openPaymentsVersion,
					...headers,
				},
				body: JSON.stringify({
					quoteId: request.quoteId,
					receiver: request.destinationPointer,
					debitAmount: {
						value: request.amount.toFixed(2),
						assetCode: request.currency,
						assetScale: 2,
					},
				}),
				signal: timeoutSignal(),
			}
		);

		if (!response.ok) {
			throw new Error(`Rafiki outgoing payment failed (${response.status})`);
		}

		const payload = (await response.json()) as { id: string; state?: { status?: string } };
		return {
			id: payload.id,
			status: payload.state?.status === "COMPLETED" ? "COMPLETED" : "PENDING",
			amount: request.amount,
			currency: request.currency,
			quoteId: request.quoteId,
		};
	}

	async monitorPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
		if (env.rafikiMockMode) {
			return {
				id: paymentId,
				status: "COMPLETED",
			};
		}

		const headers = await getAuthHeader();
		const response = await fetch(
			buildRafikiUrl(
				rafikiConfig.sender.baseUrl,
				rafikiConfig.sender.outgoingPaymentStatusPath(paymentId)
			),
			{
				headers: {
					"Open-Payments-Version": rafikiConfig.openPaymentsVersion,
					...headers,
				},
				signal: timeoutSignal(),
			}
		);

		if (!response.ok) {
			throw new Error(`Failed to fetch outgoing payment status (${response.status})`);
		}

		const payload = (await response.json()) as { state?: { status?: string } };
		return {
			id: paymentId,
			status: payload.state?.status === "COMPLETED" ? "COMPLETED" : "PENDING",
		};
	}
}

export const rafikiService = new RafikiService();
