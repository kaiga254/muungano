import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/config/env";
import { resolveSession } from "@/services/authService";
import {
	generatePayrollQuote,
	rejectPayrollQuote,
} from "@/services/quoteService";

/**
 * POST /api/payroll/quote
 * Generate a pre-approval payroll quote for the given employee.
 * Body: { employeeId: string; payPeriod?: string }
 */
export async function POST(request: Request) {
	const cookieStore = await cookies();
	const token = cookieStore.get(env.sessionCookieName)?.value;
	const session = token ? await resolveSession(token) : null;

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const body = (await request.json()) as {
			employeeId?: string;
			payPeriod?: string;
		};

		if (!body.employeeId) {
			return NextResponse.json(
				{ error: "employeeId is required" },
				{ status: 400 },
			);
		}

		const quote = await generatePayrollQuote({
			employeeId: body.employeeId,
			companyId: session.companyId,
			generatedBy: session.userId,
			payPeriod: body.payPeriod,
		});

		return NextResponse.json({ quote });
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to generate payroll quote",
			},
			{ status: 500 },
		);
	}
}

/**
 * DELETE /api/payroll/quote?id=<quoteId>
 * Reject (cancel) a pending quote.
 */
export async function DELETE(request: Request) {
	const cookieStore = await cookies();
	const token = cookieStore.get(env.sessionCookieName)?.value;
	const session = token ? await resolveSession(token) : null;

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { searchParams } = new URL(request.url);
	const quoteId = searchParams.get("id");

	if (!quoteId) {
		return NextResponse.json(
			{ error: "Quote id is required" },
			{ status: 400 },
		);
	}

	try {
		await rejectPayrollQuote(quoteId, session.companyId);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to reject quote",
			},
			{ status: 500 },
		);
	}
}
