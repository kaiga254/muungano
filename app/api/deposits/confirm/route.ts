import { NextResponse } from "next/server";
import { confirmDeposit } from "@/src/withdrawals/depositService";
import { ConfirmDepositSchema } from "@/src/shared/validators";
import { toHttpError } from "@/src/shared/errors";
import { ZodError } from "zod";

/**
 * POST /api/deposits/confirm
 * Webhook endpoint called by bank/mpesa simulators after a deposit completes.
 * No session required — authenticated by depositId + reference matching.
 */
export async function POST(request: Request) {
	try {
		const body = await request.json();
		const data = ConfirmDepositSchema.parse(body);

		const deposit = await confirmDeposit({
			depositId: data.depositId,
			reference: data.reference,
		});
		return NextResponse.json({ message: "Deposit confirmed.", deposit });
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
