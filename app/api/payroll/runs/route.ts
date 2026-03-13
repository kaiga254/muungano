import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/session";
import { getRecentPayrollRuns } from "@/services/walletService";

export async function GET(request: Request) {
	const session = await getSessionFromCookies();
	if (!session) {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	try {
		const url = new URL(request.url);
		const limitRaw = Number(url.searchParams.get("limit") ?? 20);
		const offsetRaw = Number(url.searchParams.get("offset") ?? 0);
		const limit = Number.isFinite(limitRaw)
			? Math.min(Math.max(limitRaw, 1), 100)
			: 20;
		const offset = Number.isFinite(offsetRaw)
			? Math.max(offsetRaw, 0)
			: 0;

		const rows = await getRecentPayrollRuns(limit + 1, session.companyId, offset);
		const hasMore = rows.length > limit;
		const runs = hasMore ? rows.slice(0, limit) : rows;

		return NextResponse.json({
			runs,
			pagination: {
				limit,
				offset,
				hasMore,
			},
		});
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to load payroll transactions.",
			},
			{ status: 500 }
		);
	}
}
