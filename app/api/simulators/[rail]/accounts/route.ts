import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/session";
import {
	listRailAccounts,
	type SimulatorRail,
} from "@/services/simulatorLedgerService";

type Context = {
	params: Promise<{ rail: string }>;
};

const asRail = (value: string): SimulatorRail | null => {
	if (value === "mpesa" || value === "bank" || value === "sacco" || value === "insurance") {
		return value;
	}

	return null;
};

export async function GET(_request: Request, context: Context) {
	const session = await getSessionFromCookies();
	if (!session) {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	const { rail: rawRail } = await context.params;
	const rail = asRail(rawRail);
	if (!rail) {
		return NextResponse.json({ error: "Unsupported simulator rail." }, { status: 400 });
	}

	try {
		const accounts = await listRailAccounts(session.companyId, rail);
		return NextResponse.json({ rail, accounts });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Failed to load simulator accounts." },
			{ status: 500 }
		);
	}
}
