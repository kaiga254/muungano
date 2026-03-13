import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/session";
import {
	postLedgerTransaction,
	type LedgerDirection,
	type SimulatorRail,
} from "@/services/simulatorLedgerService";

type Context = {
	params: Promise<{ rail: string }>;
};

type Body = {
	employeeId: string;
	direction: LedgerDirection;
	amount: number;
	currency?: string;
	narration?: string;
	reference?: string;
};

const asRail = (value: string): SimulatorRail | null => {
	if (value === "mpesa" || value === "bank" || value === "sacco" || value === "insurance") {
		return value;
	}

	return null;
};

const isDirection = (value: string): value is LedgerDirection => {
	return value === "credit" || value === "debit";
};

export async function POST(request: Request, context: Context) {
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
		const body = (await request.json()) as Partial<Body>;
		if (!body.employeeId || !body.direction || !body.amount) {
			return NextResponse.json(
				{ error: "employeeId, direction and amount are required." },
				{ status: 400 }
			);
		}

		if (!isDirection(body.direction)) {
			return NextResponse.json({ error: "direction must be credit or debit." }, { status: 400 });
		}

		const transaction = await postLedgerTransaction({
			companyId: session.companyId,
			employeeId: body.employeeId,
			rail,
			direction: body.direction,
			amount: Number(body.amount),
			currency: body.currency ?? "KES",
			reference:
				body.reference ?? `${rail}-${body.direction}-${body.employeeId}-${randomUUID()}`,
			narration: body.narration,
			metadata: { source: "manual-simulator" },
			createdBy: session.userId,
		});

		return NextResponse.json({ transaction }, { status: 201 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Failed to post simulator transaction.";
		const status = message.includes("Insufficient") ? 400 : 500;
		return NextResponse.json({ error: message }, { status });
	}
}
