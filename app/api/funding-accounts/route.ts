import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/src/auth/authService";
import { listFundingAccountsByUser } from "@/src/simulators/fundingAccountService";
import { toHttpError } from "@/src/shared/errors";
import { env } from "@/config/env";
import type { Currency } from "@/src/shared/currency";

async function getSession() {
	const cookieStore = await cookies();
	const token = cookieStore.get(env.sessionCookieName)?.value;
	if (!token) return null;
	return resolveSession(token);
}

/** GET /api/funding-accounts?currency=KES&type=bank */
export async function GET(request: Request) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const rawCurrency = searchParams.get("currency");
		const rawType = searchParams.get("type");

		const currency =
			rawCurrency && ["KES", "MWK", "USD"].includes(rawCurrency)
				? (rawCurrency as Currency)
				: undefined;

		const type =
			rawType === "bank" || rawType === "mobile_money"
				? rawType
				: undefined;

		const accounts = await listFundingAccountsByUser({
			userId: session.userId,
			currency,
			type,
		});

		return NextResponse.json({ accounts });
	} catch (error) {
		const { message, status } = toHttpError(error);
		return NextResponse.json({ error: message }, { status });
	}
}
