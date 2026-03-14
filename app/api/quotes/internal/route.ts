import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSession } from "@/src/auth/authService";
import { createQuote } from "@/src/quotes/quoteService";
import { getWalletById } from "@/src/wallets/walletService";
import { InternalTransferQuoteSchema } from "@/src/shared/validators";
import { toHttpError } from "@/src/shared/errors";
import { env } from "@/config/env";
import { ZodError } from "zod";

/**
 * POST /api/quotes/internal
 *
 * Creates an FX quote for an internal wallet-to-wallet transfer
 * (no external recipient required).
 *
 * Body: { sourceWalletId, destWalletId, sourceAmount }
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(env.sessionCookieName)?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const session = await resolveSession(token);
    if (!session) return NextResponse.json({ error: "Session expired." }, { status: 401 });

    const body = await request.json() as unknown;
    const data = InternalTransferQuoteSchema.parse(body);

    // Verify both wallets belong to the authenticated user
    const [sourceWallet, destWallet] = await Promise.all([
      getWalletById(data.sourceWalletId, session.userId),
      getWalletById(data.destWalletId, session.userId),
    ]);

    if (sourceWallet.status === "frozen") {
      return NextResponse.json({ error: "Source wallet is frozen." }, { status: 422 });
    }
    if (destWallet.status === "frozen") {
      return NextResponse.json({ error: "Destination wallet is frozen." }, { status: 422 });
    }

    // Verify sufficient balance (in minor units)
    const sourceAmountMinor = Math.round(data.sourceAmount * 100);
    if (sourceWallet.balance < sourceAmountMinor) {
      return NextResponse.json({ error: "Insufficient balance in source wallet." }, { status: 422 });
    }

    const quote = await createQuote({
      userId: session.userId,
      sourceWalletId: sourceWallet.id,
      sourceCurrency: sourceWallet.currency,
      destinationCurrency: destWallet.currency,
      sourceAmount: BigInt(sourceAmountMinor),
      metadata: {
        recipientType: "internal",
        recipientMode: "internal_wallet",
        recipientSummary: {
          mode: "internal_wallet",
          destWalletId: destWallet.id,
          destCurrency: destWallet.currency,
        },
        destWalletId: destWallet.id,
      },
    });

    return NextResponse.json({ quote }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Validation error." },
        { status: 400 },
      );
    }
    const { message, status } = toHttpError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
