import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/src/auth/authService";
import {
	initiateDeposit,
	getDepositsByUser,
} from "@/src/withdrawals/depositService";
import { CreateDepositSchema } from "@/src/shared/validators";
import { toHttpError } from "@/src/shared/errors";
import { env } from "@/config/env";
import { ZodError } from "zod";

async function getSession() {
	const cookieStore = await cookies();
	const token = cookieStore.get(env.sessionCookieName)?.value;
	if (!token) return null;
	return resolveSession(token);
}

/** GET /api/deposits */
export async function GET(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

		const { searchParams } = new URL(request.url);
		const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
		const offset = Number(searchParams.get("offset") ?? 0);

		const deposits = await getDepositsByUser(session.userId, limit, offset);
		return NextResponse.json({ deposits });
	} catch (error) {
		const { message, status } = toHttpError(error);
		return NextResponse.json({ error: message }, { status });
	}
}

/** POST /api/deposits — initiate a deposit */
export async function POST(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

		const body = await request.json();
		const data = CreateDepositSchema.parse(body);

		const result = await initiateDeposit({
			userId: session.userId,
			walletId: data.walletId,
			amount: BigInt(data.amount),
			method: data.method,
			idempotencyKey: data.idempotencyKey,
		});

		return NextResponse.json(result, { status: 201 });
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
