import { cookies } from "next/headers";
import { env } from "@/config/env";
import { resolveSession, type SessionPayload } from "@/src/auth/authService";

export const getSessionFromCookies = async (): Promise<SessionPayload | null> => {
	const cookieStore = await cookies();
	const token = cookieStore.get(env.sessionCookieName)?.value;
	if (!token) {
		return null;
	}
	return resolveSession(token);
};

export { type SessionPayload };
