import { NextResponse } from "next/server";
import { register } from "@/src/auth/authService";
import { RegisterSchema } from "@/src/shared/validators";
import { toHttpError } from "@/src/shared/errors";
import { ZodError } from "zod";

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const data = RegisterSchema.parse(body);
		const user = await register(data);
		return NextResponse.json(
			{ message: "Account created successfully.", user },
			{ status: 201 }
		);
	} catch (error) {
		if (error instanceof ZodError) {
			return NextResponse.json(
				{ error: error.issues[0]?.message ?? "Validation error." },
				{ status: 400 }
			);
		}
		const { message, status } = toHttpError(error);
		return NextResponse.json({ error: message }, { status });
	}
}
