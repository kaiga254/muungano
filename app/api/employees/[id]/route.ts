import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/services/authService";
import {
	getEmployee,
	updateEmployee,
	deactivateEmployee,
	type UpdateEmployeeInput,
} from "@/services/employeeService";
import { env } from "@/config/env";

async function requireSession() {
	const cookieStore = await cookies();
	const token = cookieStore.get(env.sessionCookieName)?.value;
	if (!token) return null;
	return resolveSession(token);
}

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/employees/[id]
export async function GET(_request: Request, context: RouteContext) {
	const session = await requireSession();
	if (!session) {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	const { id } = await context.params;

	try {
		const employee = await getEmployee(id, session.companyId);
		if (!employee) {
			return NextResponse.json({ error: "Employee not found." }, { status: 404 });
		}
		return NextResponse.json({ employee });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Failed to get employee." },
			{ status: 500 }
		);
	}
}

// PUT /api/employees/[id]
export async function PUT(request: Request, context: RouteContext) {
	const session = await requireSession();
	if (!session) {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	const { id } = await context.params;

	try {
		const body = (await request.json()) as UpdateEmployeeInput;
		const employee = await updateEmployee(id, session.companyId, body);
		return NextResponse.json({ employee });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to update employee.";
		const status =
			message.includes("not found")
				? 404
				: message.includes("already in use") || message.includes("total 100%")
				? 400
				: 500;
		return NextResponse.json({ error: message }, { status });
	}
}

// DELETE /api/employees/[id] — soft-delete (deactivate)
export async function DELETE(_request: Request, context: RouteContext) {
	const session = await requireSession();
	if (!session) {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	const { id } = await context.params;

	try {
		await deactivateEmployee(id, session.companyId);
		return NextResponse.json({ message: "Employee deactivated." });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Failed to deactivate employee." },
			{ status: 500 }
		);
	}
}
