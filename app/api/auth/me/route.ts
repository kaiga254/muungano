import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/services/authService";
import { env } from "@/config/env";

export async function GET() {
	try {
		const cookieStore = await cookies();
		const token = cookieStore.get(env.sessionCookieName)?.value;

		if (!token) {
			return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
		}

		const session = await resolveSession(token);
		if (!session) {
			return NextResponse.json({ error: "Session expired or invalid." }, { status: 401 });
		}

		return NextResponse.json({ session });
	} catch {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}
}
