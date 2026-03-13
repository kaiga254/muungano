import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession, markPhoneVerified } from "@/src/auth/authService";
import { generateOtp, verifyOtp } from "@/src/auth/otpService";
import { toHttpError } from "@/src/shared/errors";
import { env } from "@/config/env";
import { ZodError } from "zod";

/** POST /api/auth/verify-phone
 *  body: { phone } — sends OTP to phone (console log in dev)
 *  or body: { phone, code } — verifies OTP and marks phone as verified
 */
export async function POST(request: Request) {
	try {
		const body = await request.json();
		const cookieStore = await cookies();
		const token = cookieStore.get(env.sessionCookieName)?.value;
		if (!token) {
			return NextResponse.json({ error: "Authentication required." }, { status: 401 });
		}

		const session = await resolveSession(token);
		if (!session) {
			return NextResponse.json({ error: "Invalid session." }, { status: 401 });
		}

		// If code not provided, initiate OTP
		if (!body.code) {
			const generated = await generateOtp(session.userId, session.phone, "verify_phone");
			return NextResponse.json({
				message: "OTP sent.",
				...(env.nodeEnv !== "production" ? { devCode: generated.devCode } : {}),
			});
		}

		// Verify OTP
		const code = typeof body.code === "string" ? body.code : "";
		if (code.length !== 6) {
			return NextResponse.json({ error: "Invalid or expired OTP." }, { status: 400 });
		}
		await verifyOtp(session.userId, code, "verify_phone");
		await markPhoneVerified(session.userId);

		return NextResponse.json({ message: "Phone verified." });
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
