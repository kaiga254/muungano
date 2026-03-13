import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logIn, purgeExpiredSessions } from "@/services/authService";
import { env } from "@/config/env";

type LoginBody = {
	email: string;
	password: string;
};

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as Partial<LoginBody>;

		if (!body.email || !body.password) {
			return NextResponse.json(
				{ error: "email and password are required." },
				{ status: 400 }
			);
		}

		const { token, payload } = await logIn(body.email, body.password);

		// Opportunistically clean up expired sessions
		void purgeExpiredSessions().catch(() => undefined);

		const cookieStore = await cookies();
		cookieStore.set(env.sessionCookieName, token, {
			httpOnly: true,
			secure: env.nodeEnv === "production",
			sameSite: "lax",
			path: "/",
			maxAge: env.sessionTtlSeconds,
		});

		return NextResponse.json({ message: "Logged in.", session: payload });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Login failed.";
		const status =
			message.includes("Invalid email or password") ||
			message.includes("deactivated")
				? 401
				: 500;
		return NextResponse.json({ error: message }, { status });
	}
}
