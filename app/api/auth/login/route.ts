import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logIn, purgeExpiredSessions } from "@/src/auth/authService";
import { LoginSchema } from "@/src/shared/validators";
import { toHttpError } from "@/src/shared/errors";
import { env } from "@/config/env";
import { ZodError } from "zod";

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const data = LoginSchema.parse(body);

		const { token, session } = await logIn(data.email, data.password);
		void purgeExpiredSessions().catch(() => undefined);

		const cookieStore = await cookies();
		cookieStore.set(env.sessionCookieName, token, {
			httpOnly: true,
			secure: env.nodeEnv === "production",
			sameSite: "lax",
			path: "/",
			maxAge: env.sessionTtlSeconds,
		});

		return NextResponse.json({ message: "Logged in.", session });
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
