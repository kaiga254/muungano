import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/src/auth/authService";
import { createQuote } from "@/src/quotes/quoteService";
import { CreateQuoteSchema } from "@/src/shared/validators";
import { toHttpError } from "@/src/shared/errors";
import { env } from "@/config/env";
import { ZodError } from "zod";
import type { Currency } from "@/src/shared/currency";

/** POST /api/quotes — create a payment quote */
export async function POST(request: Request) {
	try {
		const cookieStore = await cookies();
		const token = cookieStore.get(env.sessionCookieName)?.value;
		if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

		const session = await resolveSession(token);
		if (!session) return NextResponse.json({ error: "Session expired." }, { status: 401 });

		const body = await request.json();
		const data = CreateQuoteSchema.parse(body);

		const quote = await createQuote({
			userId: session.userId,
			sourceCurrency: data.sourceCurrency as Currency,
			destinationCurrency: data.destinationCurrency as Currency,
			sourceAmount: BigInt(data.sourceAmount),
		});

		return NextResponse.json({ quote }, { status: 201 });
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
