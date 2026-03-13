import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/src/auth/authService";
import { getPaymentHistory } from "@/src/payments/paymentService";
import { toHttpError } from "@/src/shared/errors";
import { env } from "@/config/env";

/** GET /api/payments/history */
export async function GET(request: Request) {
	try {
		const cookieStore = await cookies();
		const token = cookieStore.get(env.sessionCookieName)?.value;
		if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

		const session = await resolveSession(token);
		if (!session) return NextResponse.json({ error: "Session expired." }, { status: 401 });

		const { searchParams } = new URL(request.url);
		const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
		const offset = Number(searchParams.get("offset") ?? 0);

		const payments = await getPaymentHistory(session.userId, limit, offset);
		return NextResponse.json({ payments });
	} catch (error) {
		const { message, status } = toHttpError(error);
		return NextResponse.json({ error: message }, { status });
	}
}
