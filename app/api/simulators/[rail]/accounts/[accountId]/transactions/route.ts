import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/session";
import {
	listAccountTransactions,
	type SimulatorRail,
} from "@/services/simulatorLedgerService";

type Context = {
	params: Promise<{ rail: string; accountId: string }>;
};

const asRail = (value: string): SimulatorRail | null => {
	if (value === "mpesa" || value === "bank" || value === "sacco" || value === "insurance") {
		return value;
	}

	return null;
};

export async function GET(request: Request, context: Context) {
	const session = await getSessionFromCookies();
	if (!session) {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	const { rail: rawRail, accountId } = await context.params;
	const rail = asRail(rawRail);
	if (!rail) {
		return NextResponse.json({ error: "Unsupported simulator rail." }, { status: 400 });
	}

	const url = new URL(request.url);
	const limitRaw = Number(url.searchParams.get("limit") ?? 30);
	const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 30;

	try {
		const transactions = await listAccountTransactions(session.companyId, accountId, limit);
		return NextResponse.json({ rail, accountId, transactions });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Failed to load transactions." },
			{ status: 500 }
		);
	}
}
