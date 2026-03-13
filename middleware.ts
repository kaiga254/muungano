import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "@/config/env";

// Routes that do NOT require authentication
const PUBLIC_PATHS = new Set(["/", "/login", "/signup"]);
// API routes that are public
const PUBLIC_API_PREFIXES = ["/api/auth/signup", "/api/auth/login"];

export function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// Allow public pages and public API routes
	if (
		PUBLIC_PATHS.has(pathname) ||
		PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
		pathname.startsWith("/_next") ||
		pathname.startsWith("/favicon")
	) {
		return NextResponse.next();
	}

	const token = request.cookies.get(env.sessionCookieName)?.value;

	// No token → redirect to login or return 401 for API routes
	if (!token) {
		if (pathname.startsWith("/api/")) {
			return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
		}

		const loginUrl = request.nextUrl.clone();
		loginUrl.pathname = "/login";
		loginUrl.searchParams.set("next", pathname);
		return NextResponse.redirect(loginUrl);
	}

	// Has a token cookie – let the route handler validate it against the DB
	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|favicon.ico|public/).*)",
	],
};
