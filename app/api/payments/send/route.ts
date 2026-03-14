import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/src/auth/authService";
import { sendPayment } from "@/src/payments/paymentService";
import { SendPaymentSchema } from "@/src/shared/validators";
import { toHttpError } from "@/src/shared/errors";
import { env } from "@/config/env";
import { ZodError } from "zod";

/** POST /api/payments/send */
export async function POST(request: Request) {
	try {
		const cookieStore = await cookies();
		const token = cookieStore.get(env.sessionCookieName)?.value;
		if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

		const session = await resolveSession(token);
		if (!session) return NextResponse.json({ error: "Session expired." }, { status: 401 });

		const body = await request.json();
		const data = SendPaymentSchema.parse(body);

		const payment = await sendPayment({
			userId: session.userId,
			quoteId: data.quoteId,
			pin: data.pin,
			idempotencyKey: data.idempotencyKey,
		});

		return NextResponse.json({ message: "Payment sent.", payment }, { status: 201 });
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
