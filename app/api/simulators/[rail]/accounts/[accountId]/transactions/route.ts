import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/src/auth/authService";
import { env } from "@/config/env";
import { listFundingAccountTransactions } from "@/src/simulators/fundingAccountService";
import { toHttpError } from "@/src/shared/errors";

type Context = {
  params: Promise<{ rail: string; accountId: string }>;
};

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.sessionCookieName)?.value;
  if (!token) return null;
  return resolveSession(token);
}

/** GET /api/simulators/[rail]/accounts/[accountId]/transactions */
export async function GET(request: Request, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { accountId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
    const offset = Number(searchParams.get("offset") ?? 0);

    const transactions = await listFundingAccountTransactions({
      userId: session.userId,
      fundingAccountId: accountId,
      limit,
      offset,
    });

    return NextResponse.json({ transactions });
  } catch (error) {
    const { message, status } = toHttpError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
