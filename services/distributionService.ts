import { env } from "@/config/env";
import type { SalarySplit } from "./payrollService";

export type DistributionInput = {
	payrollRunId: string;
	employeeName: string;
	currency: string;
	splits: SalarySplit[];
};

export type DistributionEntry = {
	obligation: string;
	endpoint: string;
	amount: number;
	status: "SUCCESS" | "FAILED";
	response: unknown;
};

const endpointBySplit: Record<SalarySplit["key"], string> = {
	wallet: `${env.mpesaServiceUrl}/credit`,
	familyRemittance: `${env.bankServiceUrl}/transfer`,
	savings: `${env.saccoServiceUrl}/deposit`,
	schoolFees: `${env.bankServiceUrl}/payment`,
	insurance: `${env.insuranceServiceUrl}/premium`,
};

const postToInstitution = async (
	endpoint: string,
	payload: Record<string, unknown>
): Promise<DistributionEntry> => {
	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(env.requestTimeoutMs),
		});

		const data = await response.json().catch(() => ({}));
		if (!response.ok) {
			return {
				obligation: String(payload.obligation),
				endpoint,
				amount: Number(payload.amount),
				status: "FAILED",
				response: {
					status: response.status,
					data,
				},
			};
		}

		return {
			obligation: String(payload.obligation),
			endpoint,
			amount: Number(payload.amount),
			status: "SUCCESS",
			response: data,
		};
	} catch (error) {
		return {
			obligation: String(payload.obligation),
			endpoint,
			amount: Number(payload.amount),
			status: "FAILED",
			response: {
				error: error instanceof Error ? error.message : "Unknown distribution error",
			},
		};
	}
};

export const distributeSalary = async (input: DistributionInput): Promise<DistributionEntry[]> => {
	const calls = input.splits.map((split) => {
		const endpoint = endpointBySplit[split.key];
		const payload = {
			payrollRunId: input.payrollRunId,
			employeeName: input.employeeName,
			obligation: split.label,
			amount: split.amount,
			currency: input.currency,
			timestamp: new Date().toISOString(),
		};

		return postToInstitution(endpoint, payload);
	});

	return Promise.all(calls);
};
