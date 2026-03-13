import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/src/auth/authService";
import { submitKyc, getKycByUserId } from "@/src/kyc/kycService";
import { KycSubmitSchema } from "@/src/shared/validators";
import { toHttpError } from "@/src/shared/errors";
import { env } from "@/config/env";
import { ZodError } from "zod";

/** POST /api/kyc/submit */
export async function POST(request: Request) {
	try {
		const cookieStore = await cookies();
		const token = cookieStore.get(env.sessionCookieName)?.value;
		if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

		const session = await resolveSession(token);
		if (!session) return NextResponse.json({ error: "Session expired." }, { status: 401 });

		const body = await request.json();
		const data = KycSubmitSchema.parse(body);

		const profile = await submitKyc({
			userId: session.userId,
			fullName: data.fullName,
			nationalId: data.nationalId,
			dateOfBirth: data.dateOfBirth,
			country: data.country,
		});
		return NextResponse.json({ message: "KYC submitted.", profile }, { status: 201 });
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

/** GET /api/kyc/submit → redirect to status */
export async function GET() {
	try {
		const cookieStore = await cookies();
		const token = cookieStore.get(env.sessionCookieName)?.value;
		if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

		const session = await resolveSession(token);
		if (!session) return NextResponse.json({ error: "Session expired." }, { status: 401 });

		const profile = await getKycByUserId(session.userId);
		return NextResponse.json({ profile });
	} catch (error) {
		const { message, status } = toHttpError(error);
		return NextResponse.json({ error: message }, { status });
	}
}
