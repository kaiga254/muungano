import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/config/env";
import { calculateSalarySplits } from "@/services/payrollService";
import { rafikiService } from "@/services/rafikiService";
import { distributeSalary } from "@/services/distributionService";
import { logPayrollRun } from "@/services/walletService";
import { resolveSession } from "@/services/authService";
import { getEmployee } from "@/services/employeeService";

type RunPayrollRequest = {
	// Option A: supply employee id (preferred – uses stored profile)
	employeeId?: string;
	// Option B: ad-hoc fields (backward-compat with demo flow)
	employeeName?: string;
	salaryAmount?: number;
	destinationPointer?: string;
};

export async function POST(request: Request) {
	// --- Auth ---
	const cookieStore = await cookies();
	const token = cookieStore.get(env.sessionCookieName)?.value;
	const session = token ? await resolveSession(token) : null;

	try {
		const body = (await request.json()) as Partial<RunPayrollRequest>;

		let employeeName: string;
		let salaryAmount: number;
		let destinationPointer: string;
		let employeeId: string | undefined;
		let splitRules;

		if (body.employeeId && session) {
			// --- Employee profile-driven flow ---
			const employee = await getEmployee(body.employeeId, session.companyId);
			if (!employee) {
				return NextResponse.json(
					{ error: "Employee not found." },
					{ status: 404 }
				);
			}
			if (!employee.isActive) {
				return NextResponse.json(
					{ error: "Cannot run payroll for an inactive employee." },
					{ status: 400 }
				);
			}

			employeeId = employee.id;
			employeeName = employee.fullName;
			salaryAmount = employee.salaryAmount;
			destinationPointer = employee.destinationPointer;
			splitRules = employee.splitRules;
		} else {
			// --- Legacy ad-hoc flow ---
			if (!body.employeeName || !body.destinationPointer || !body.salaryAmount) {
				return NextResponse.json(
					{
						error:
							"Provide employeeId (preferred) or employeeName, salaryAmount, and destinationPointer.",
					},
					{ status: 400 }
				);
			}

			if (body.salaryAmount <= 0) {
				return NextResponse.json(
					{ error: "salaryAmount must be greater than zero" },
					{ status: 400 }
				);
			}

			employeeName = body.employeeName;
			salaryAmount = body.salaryAmount;
			destinationPointer = body.destinationPointer;
		}

		const payrollRunId = randomUUID();
		const destinationAmount = Number((salaryAmount * env.mwkToKesRate).toFixed(2));
		const splits = calculateSalarySplits(destinationAmount, "KES", splitRules);

		const quote = await rafikiService.createQuote({
			sourceAmount: salaryAmount,
			sourceCurrency: "MWK",
			destinationAmount,
			destinationCurrency: "KES",
			receiverWalletAddress: destinationPointer,
		});

		await rafikiService.createIncomingPayment(destinationPointer, destinationAmount, "KES");

		const outgoingPayment = await rafikiService.sendOutgoingPayment({
			quoteId: quote.id,
			destinationPointer,
			amount: salaryAmount,
			currency: "MWK",
		});

		const paymentStatus = await rafikiService.monitorPaymentStatus(outgoingPayment.id);
		const distributionResults = await distributeSalary({
			payrollRunId,
			employeeName,
			currency: "KES",
			splits,
			companyId: session?.companyId,
			employeeId,
			createdBy: session?.userId,
		});

		const runRecord = {
			id: payrollRunId,
			companyId: session?.companyId,
			employeeId,
			createdBy: session?.userId,
			employeeName,
			sourceAmount: salaryAmount,
			sourceCurrency: "MWK",
			destinationAmount,
			destinationCurrency: "KES",
			destinationPointer,
			quoteId: quote.id,
			paymentId: outgoingPayment.id,
			status: paymentStatus.status,
			splits,
			distributionResults,
			createdAt: new Date().toISOString(),
		} as const;

		await logPayrollRun(runRecord);

		return NextResponse.json({
			message: "Payroll run completed",
			payrollRun: runRecord,
			quote,
			paymentStatus,
			exchangeRate: env.mwkToKesRate,
		});
	} catch (error) {
		return NextResponse.json(
			{
				error: "Failed to execute payroll run",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 }
		);
	}
}
