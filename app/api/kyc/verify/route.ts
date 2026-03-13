import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/src/auth/authService";
import { verifyKyc, rejectKyc } from "@/src/kyc/kycService";
import { toHttpError } from "@/src/shared/errors";
import { env } from "@/config/env";

/**
 * POST /api/kyc/verify
 * Mock admin endpoint to approve or reject a KYC profile.
 * body: { userId: string; action: "approve" | "reject"; reason?: string }
 */
export async function POST(request: Request) {
	try {
		const cookieStore = await cookies();
		const token = cookieStore.get(env.sessionCookieName)?.value;
		if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

		const session = await resolveSession(token);
		if (!session) return NextResponse.json({ error: "Session expired." }, { status: 401 });

		const body = (await request.json()) as {
			userId?: string;
			action?: "approve" | "reject";
			reason?: string;
		};

		if (!body.userId || !body.action) {
			return NextResponse.json({ error: "userId and action are required." }, { status: 400 });
		}

		if (body.action === "approve") {
			const profile = await verifyKyc(body.userId);
			return NextResponse.json({ message: "KYC approved.", profile });
		} else if (body.action === "reject") {
			await rejectKyc(body.userId);
			return NextResponse.json({ message: "KYC rejected." });
		} else {
			return NextResponse.json({ error: "action must be 'approve' or 'reject'." }, { status: 400 });
		}
	} catch (error) {
		const { message, status } = toHttpError(error);
		return NextResponse.json({ error: message }, { status });
	}
}
