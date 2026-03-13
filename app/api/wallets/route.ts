import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/src/auth/authService";
import { createWallet, getWalletsByUser } from "@/src/wallets/walletService";
import { CreateWalletSchema } from "@/src/shared/validators";
import { toHttpError } from "@/src/shared/errors";
import { env } from "@/config/env";
import { ZodError } from "zod";
import type { Currency } from "@/src/shared/currency";

async function getSession() {
	const cookieStore = await cookies();
	const token = cookieStore.get(env.sessionCookieName)?.value;
	if (!token) return null;
	return resolveSession(token);
}

/** GET /api/wallets — list user wallets */
export async function GET() {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

		const wallets = await getWalletsByUser(session.userId);
		return NextResponse.json({ wallets });
	} catch (error) {
		const { message, status } = toHttpError(error);
		return NextResponse.json({ error: message }, { status });
	}
}

/** POST /api/wallets — create a wallet for a currency */
export async function POST(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

		const body = await request.json();
		const data = CreateWalletSchema.parse(body);

		const wallet = await createWallet(session.userId, data.currency as Currency);
		return NextResponse.json({ message: "Wallet created.", wallet }, { status: 201 });
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
