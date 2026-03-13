import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/services/authService";
import {
	listEmployees,
	createEmployee,
	type CreateEmployeeInput,
} from "@/services/employeeService";
import { env } from "@/config/env";

async function requireSession() {
	const cookieStore = await cookies();
	const token = cookieStore.get(env.sessionCookieName)?.value;
	if (!token) return null;
	return resolveSession(token);
}

// GET /api/employees — list all employees for the authenticated company
export async function GET(request: Request) {
	const session = await requireSession();
	if (!session) {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	try {
		const { searchParams } = new URL(request.url);
		const activeOnly = searchParams.get("activeOnly") !== "false";
		const employees = await listEmployees(session.companyId, { activeOnly });
		return NextResponse.json({ employees });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Failed to list employees." },
			{ status: 500 }
		);
	}
}

// POST /api/employees — onboard a new employee
export async function POST(request: Request) {
	const session = await requireSession();
	if (!session) {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	try {
		const body = (await request.json()) as Partial<CreateEmployeeInput>;

		if (!body.fullName || !body.salaryAmount || !body.destinationPointer) {
			return NextResponse.json(
				{
					error:
						"fullName, salaryAmount, and destinationPointer are required.",
				},
				{ status: 400 }
			);
		}

		if (Number(body.salaryAmount) <= 0) {
			return NextResponse.json(
				{ error: "salaryAmount must be greater than zero." },
				{ status: 400 }
			);
		}

		const employee = await createEmployee(session.companyId, {
			...body,
			fullName: body.fullName,
			salaryAmount: Number(body.salaryAmount),
			destinationPointer: body.destinationPointer,
			createdBy: session.userId,
		} as CreateEmployeeInput);

		return NextResponse.json({ employee }, { status: 201 });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to create employee.";
		const status =
			message.includes("already in use") || message.includes("total 100%")
				? 400
				: 500;
		return NextResponse.json({ error: message }, { status });
	}
}
