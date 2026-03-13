import { NextResponse } from "next/server";
import { signUp } from "@/services/authService";

type SignUpBody = {
	companyName: string;
	companyCountry: string;
	companyCurrency: string;
	fullName: string;
	email: string;
	password: string;
};

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as Partial<SignUpBody>;

		if (
			!body.companyName ||
			!body.fullName ||
			!body.email ||
			!body.password
		) {
			return NextResponse.json(
				{ error: "companyName, fullName, email, and password are required." },
				{ status: 400 }
			);
		}

		if (body.password.length < 8) {
			return NextResponse.json(
				{ error: "Password must be at least 8 characters." },
				{ status: 400 }
			);
		}

		const { user, company } = await signUp({
			companyName: body.companyName,
			companyCountry: body.companyCountry ?? "KE",
			companyCurrency: body.companyCurrency ?? "KES",
			fullName: body.fullName,
			email: body.email,
			password: body.password,
		});

		return NextResponse.json(
			{ message: "Account created successfully.", user, company },
			{ status: 201 }
		);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to create account.";
		const status = message.includes("already exists") ? 409 : 500;
		return NextResponse.json({ error: message }, { status });
	}
}
