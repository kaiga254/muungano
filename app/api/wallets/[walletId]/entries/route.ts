import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/src/auth/authService";
import { getLedgerEntries } from "@/src/wallets/ledgerService";
import { getWalletById } from "@/src/wallets/walletService";
import { toHttpError } from "@/src/shared/errors";
import { env } from "@/config/env";

/** GET /api/wallets/[walletId]/entries */
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ walletId: string }> }
) {
	try {
		const cookieStore = await cookies();
		const token = cookieStore.get(env.sessionCookieName)?.value;
		if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

		const session = await resolveSession(token);
		if (!session) return NextResponse.json({ error: "Session expired." }, { status: 401 });

		const { walletId } = await params;

		// Ensure the wallet belongs to this user
		const wallet = await getWalletById(walletId);
		if (wallet.userId !== session.userId) {
			return NextResponse.json({ error: "Not found." }, { status: 404 });
		}

		const { searchParams } = new URL(_request.url);
		const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
		const offset = Number(searchParams.get("offset") ?? 0);

		const entries = await getLedgerEntries(walletId, limit, offset);
		return NextResponse.json({ entries });
	} catch (error) {
		const { message, status } = toHttpError(error);
		return NextResponse.json({ error: message }, { status });
	}
}
