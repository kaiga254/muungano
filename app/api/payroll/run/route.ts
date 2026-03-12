import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { calculateSalarySplits } from "@/services/payrollService";
import { rafikiService } from "@/services/rafikiService";
import { distributeSalary } from "@/services/distributionService";
import { logPayrollRun } from "@/services/walletService";

type RunPayrollRequest = {
	employeeName: string;
	salaryAmount: number;
	destinationPointer: string;
};

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as Partial<RunPayrollRequest>;
		if (!body.employeeName || !body.destinationPointer || !body.salaryAmount) {
			return NextResponse.json(
				{ error: "employeeName, salaryAmount and destinationPointer are required" },
				{ status: 400 }
			);
		}

		if (body.salaryAmount <= 0) {
			return NextResponse.json({ error: "salaryAmount must be greater than zero" }, { status: 400 });
		}

		const payrollRunId = randomUUID();
		const destinationAmount = Number((body.salaryAmount * env.mwkToKesRate).toFixed(2));
		const splits = calculateSalarySplits(destinationAmount, "KES");

		// Atomic payment flow for demo:
		// 1) Quote MWK->KES, 2) Send outgoing payment, 3) Confirm status, 4) Distribute obligations.
		const quote = await rafikiService.createQuote({
			sourceAmount: body.salaryAmount,
			sourceCurrency: "MWK",
			destinationAmount,
			destinationCurrency: "KES",
			receiverWalletAddress: body.destinationPointer,
		});

		await rafikiService.createIncomingPayment(body.destinationPointer, destinationAmount, "KES");

		const outgoingPayment = await rafikiService.sendOutgoingPayment({
			quoteId: quote.id,
			destinationPointer: body.destinationPointer,
			amount: body.salaryAmount,
			currency: "MWK",
		});

		const paymentStatus = await rafikiService.monitorPaymentStatus(outgoingPayment.id);
		const distributionResults = await distributeSalary({
			payrollRunId,
			employeeName: body.employeeName,
			currency: "KES",
			splits,
		});

		const runRecord = {
			id: payrollRunId,
			employeeName: body.employeeName,
			sourceAmount: body.salaryAmount,
			sourceCurrency: "MWK",
			destinationAmount,
			destinationCurrency: "KES",
			destinationPointer: body.destinationPointer,
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
