import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/src/auth/authService";
import {
	initiateWithdrawal,
	getWithdrawalsByUser,
} from "@/src/withdrawals/withdrawalService";
import { CreateWithdrawalSchema } from "@/src/shared/validators";
import { toHttpError } from "@/src/shared/errors";
import { env } from "@/config/env";
import { ZodError } from "zod";

async function getSession() {
	const cookieStore = await cookies();
	const token = cookieStore.get(env.sessionCookieName)?.value;
	if (!token) return null;
	return resolveSession(token);
}

/** GET /api/withdrawals */
export async function GET(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

		const { searchParams } = new URL(request.url);
		const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
		const offset = Number(searchParams.get("offset") ?? 0);

		const withdrawals = await getWithdrawalsByUser(session.userId, limit, offset);
		return NextResponse.json({ withdrawals });
	} catch (error) {
		const { message, status } = toHttpError(error);
		return NextResponse.json({ error: message }, { status });
	}
}

/** POST /api/withdrawals */
export async function POST(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

		const body = await request.json();
		const data = CreateWithdrawalSchema.parse(body);
		const destinationDetails = Object.fromEntries(
			Object.entries(data.destinationDetails ?? {}).map(([key, value]) => [
				key,
				String(value),
			])
		);

		const result = await initiateWithdrawal({
			userId: session.userId,
			walletId: data.walletId,
			fundingAccountId: data.fundingAccountId,
			amount: BigInt(data.amount),
			destinationType: data.destinationType,
			destinationDetails,
			pin: data.pin,
			idempotencyKey: data.idempotencyKey,
		});

		return NextResponse.json({ message: "Withdrawal initiated.", ...result }, { status: 201 });
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
