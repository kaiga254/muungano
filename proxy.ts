import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "@/config/env";

const PUBLIC_PATHS = new Set(["/", "/login", "/signup"]);
const PUBLIC_API_PREFIXES = [
	"/api/auth/register",
	"/api/auth/signup",
	"/api/auth/login",
	"/api/auth/verify-phone",
	"/api/deposits/confirm",
];

export function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	if (
		PUBLIC_PATHS.has(pathname) ||
		PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
		pathname.startsWith("/_next") ||
		pathname.startsWith("/favicon")
	) {
		return NextResponse.next();
	}

	const token = request.cookies.get(env.sessionCookieName)?.value;

	if (!token) {
		if (pathname.startsWith("/api/")) {
			return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
		}

		const loginUrl = request.nextUrl.clone();
		loginUrl.pathname = "/login";
		loginUrl.searchParams.set("next", pathname);
		return NextResponse.redirect(loginUrl);
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
