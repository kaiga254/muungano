import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { resolveSession } from "@/src/auth/authService";
import { env } from "@/config/env";
import {
  getFundingAccountById,
  postFundingAccountTransaction,
} from "@/src/simulators/fundingAccountService";
import { toHttpError, ValidationError } from "@/src/shared/errors";

type Context = {
  params: Promise<{ rail: string }>;
};

const PostSchema = z.object({
  accountId: z.string().uuid(),
  direction: z.enum(["credit", "debit"]),
  amount: z.number().positive(),
  currency: z.enum(["KES", "MWK", "USD"]),
  narration: z.string().max(200).optional(),
});

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.sessionCookieName)?.value;
  if (!token) return null;
  return resolveSession(token);
}

function railMatchesType(rail: string, type: "bank" | "mobile_money") {
  if (rail === "bank") return type === "bank";
  if (rail === "mpesa") return type === "mobile_money";
  return false;
}

/** POST /api/simulators/[rail]/post */
export async function POST(request: Request, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { rail } = await params;
    if (!["bank", "mpesa"].includes(rail)) {
      return NextResponse.json({ error: "Unknown simulator rail." }, { status: 404 });
    }

    const body = await request.json();
    const data = PostSchema.parse(body);

    const account = await getFundingAccountById(session.userId, data.accountId);
    if (!railMatchesType(rail, account.type)) {
      throw new ValidationError("Selected account does not belong to this rail.");
    }
    if (account.currency !== data.currency) {
      throw new ValidationError("Transaction currency must match funding account currency.");
    }

    const transaction = await postFundingAccountTransaction({
      userId: session.userId,
      fundingAccountId: data.accountId,
      direction: data.direction,
      amount: BigInt(Math.round(data.amount)),
      reference: `sim-${rail}-${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      narration: data.narration,
      metadata: { source: "simulator_post" },
    });

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Validation error." },
        { status: 400 }
      );
    }
    const { message, status } = toHttpError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
