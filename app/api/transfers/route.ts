import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/src/auth/authService";
import { createInternalTransfer, getTransfersByUser } from "@/src/payments/internalTransferService";
import { InternalTransferSchema } from "@/src/shared/validators";
import { toHttpError } from "@/src/shared/errors";
import { env } from "@/config/env";
import { ZodError } from "zod";

async function getSession() {
	const cookieStore = await cookies();
	const token = cookieStore.get(env.sessionCookieName)?.value;
	if (!token) return null;
	return resolveSession(token);
}

/** GET /api/transfers */
export async function GET(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

		const { searchParams } = new URL(request.url);
		const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
		const offset = Number(searchParams.get("offset") ?? 0);

		const transfers = await getTransfersByUser(session.userId, limit, offset);
		return NextResponse.json({ transfers });
	} catch (error) {
		const { message, status } = toHttpError(error);
		return NextResponse.json({ error: message }, { status });
	}
}

/** POST /api/transfers — FX swap between own wallets */
export async function POST(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

		const body = await request.json();
		const data = InternalTransferSchema.parse(body);

		const transfer = await createInternalTransfer({
			userId: session.userId,
			quoteId: data.quoteId,
			sourceWalletId: data.sourceWalletId,
			destWalletId: data.destWalletId,
			pin: data.pin,
			idempotencyKey: data.idempotencyKey,
		});

		return NextResponse.json({ message: "Transfer completed.", transfer }, { status: 201 });
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
