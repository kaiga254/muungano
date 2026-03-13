import { env } from "@/config/env";
import type { SalarySplit } from "./payrollService";
import {
	postLedgerTransaction,
	type SimulatorRail,
} from "./simulatorLedgerService";

export type SenderInfo = {
	/** Name of the payroll admin who approved the run */
	adminName?: string;
	/** User ID of the admin */
	adminId?: string;
	/** Name of the sending company */
	companyName?: string;
	/** Human-readable pay period, e.g. "March 2026" */
	payPeriod?: string;
};

export type DistributionInput = {
	payrollRunId: string;
	employeeName: string;
	currency: string;
	splits: SalarySplit[];
	companyId?: string;
	employeeId?: string;
	createdBy?: string;
	/** Sender / initiator metadata shown on receiver ledger entries */
	senderInfo?: SenderInfo;
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

const railBySplit: Record<SalarySplit["key"], SimulatorRail> = {
	wallet: "mpesa",
	familyRemittance: "bank",
	savings: "sacco",
	schoolFees: "bank",
	insurance: "insurance",
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
	if (input.companyId && input.employeeId) {
		const entries = await Promise.all(
			input.splits.map(async (split) => {
				try {
					const reference = `${input.payrollRunId}-${split.key}`;
					const rail = railBySplit[split.key];
					const transaction = await postLedgerTransaction({
						companyId: input.companyId as string,
						employeeId: input.employeeId as string,
						rail,
						direction: "credit",
						amount: split.amount,
						currency: input.currency,
						reference,
						narration: split.label,
						metadata: {
							payrollRunId: input.payrollRunId,
							employeeName: input.employeeName,
							splitKey: split.key,
							splitLabel: split.label,
							splitPercentage: split.percentage,
							// Sender transparency fields (visible on receiver ledger)
							sender: input.senderInfo
								? {
										adminName: input.senderInfo.adminName,
										adminId: input.senderInfo.adminId,
										companyName: input.senderInfo.companyName,
										payPeriod: input.senderInfo.payPeriod,
									}
								: undefined,
						},
						createdBy: input.createdBy,
					});

					return {
						obligation: split.label,
						endpoint: `simulator-ledger://${rail}`,
						amount: split.amount,
						status: "SUCCESS" as const,
						response: transaction,
					};
				} catch (error) {
					return {
						obligation: split.label,
						endpoint: `simulator-ledger://${railBySplit[split.key]}`,
						amount: split.amount,
						status: "FAILED" as const,
						response: {
							error: error instanceof Error ? error.message : "Failed ledger distribution",
						},
					};
				}
			})
		);

		return entries;
	}

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
