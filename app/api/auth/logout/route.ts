import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession } from "@/src/auth/authService";
import { env } from "@/config/env";

export async function POST() {
	try {
		const cookieStore = await cookies();
		const token = cookieStore.get(env.sessionCookieName)?.value;

		if (token) {
			await deleteSession(token).catch(() => undefined);
		}

		cookieStore.set(env.sessionCookieName, "", {
			httpOnly: true,
			secure: env.nodeEnv === "production",
			sameSite: "lax",
			path: "/",
			maxAge: 0,
		});

		return NextResponse.json({ message: "Logged out." });
	} catch {
		return NextResponse.json({ message: "Logged out." });
	}
}
