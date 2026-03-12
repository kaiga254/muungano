import { NextResponse } from "next/server";
import { distributeSalary } from "@/services/distributionService";
import type { SalarySplit } from "@/services/payrollService";

type DistributionRequest = {
	payrollRunId: string;
	employeeName: string;
	currency: string;
	splits: SalarySplit[];
};

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as Partial<DistributionRequest>;
		if (!body.payrollRunId || !body.employeeName || !body.currency || !body.splits) {
			return NextResponse.json(
				{ error: "payrollRunId, employeeName, currency and splits are required" },
				{ status: 400 }
			);
		}

		const results = await distributeSalary({
			payrollRunId: body.payrollRunId,
			employeeName: body.employeeName,
			currency: body.currency,
			splits: body.splits,
		});

		return NextResponse.json({ results });
	} catch (error) {
		return NextResponse.json(
			{
				error: "Failed to distribute payroll obligations",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 }
		);
	}
}
