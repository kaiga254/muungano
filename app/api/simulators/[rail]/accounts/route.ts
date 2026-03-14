import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/src/auth/authService";
import { env } from "@/config/env";
import {
  listFundingAccountsByUser,
  type FundingAccountType,
} from "@/src/simulators/fundingAccountService";
import { toHttpError } from "@/src/shared/errors";
import type { Currency } from "@/src/shared/currency";

type Context = {
  params: Promise<{ rail: string }>;
};

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.sessionCookieName)?.value;
  if (!token) return null;
  return resolveSession(token);
}

function railToType(rail: string): FundingAccountType | null {
  if (rail === "bank") return "bank";
  if (rail === "mpesa") return "mobile_money";
  return null;
}

/** GET /api/simulators/[rail]/accounts */
export async function GET(request: Request, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { rail } = await params;
    const accountType = railToType(rail);
    if (!accountType) {
      return NextResponse.json({ error: "Unknown simulator rail." }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const rawCurrency = searchParams.get("currency");
    const currency =
      rawCurrency && ["KES", "MWK", "USD"].includes(rawCurrency)
        ? (rawCurrency as Currency)
        : undefined;

    const accounts = await listFundingAccountsByUser({
      userId: session.userId,
      type: accountType,
      currency,
    });

    return NextResponse.json({
      accounts: accounts.map((account) => ({
        id: account.id,
        providerName: account.providerName,
        accountName: account.accountName,
        accountRef: account.accountIdentifier,
        currency: account.currency,
        currentBalance: account.currentBalance,
        country: account.country,
        updatedAt: account.createdAt,
      })),
    });
  } catch (error) {
    const { message, status } = toHttpError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
