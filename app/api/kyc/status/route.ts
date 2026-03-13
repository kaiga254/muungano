import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/src/auth/authService";
import { getKycByUserId } from "@/src/kyc/kycService";
import { toHttpError } from "@/src/shared/errors";
import { env } from "@/config/env";

/** GET /api/kyc/status */
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
