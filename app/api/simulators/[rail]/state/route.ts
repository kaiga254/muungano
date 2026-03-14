import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/config/env";

type Context = {
  params: Promise<{ rail: string }>;
};

export async function GET(_req: NextRequest, { params }: Context) {
  const { rail } = await params;

  let baseUrl: string;
  if (rail === "mpesa") {
    baseUrl = env.mpesaSimulatorUrl;
  } else if (rail === "bank") {
    baseUrl = env.bankSimulatorUrl;
  } else {
    return NextResponse.json({ error: "Unknown simulator rail." }, { status: 404 });
  }

  try {
    const res = await fetch(`${baseUrl}/state`, {
      next: { revalidate: 0 },
    });
    const data = (await res.json()) as {
      floatBalance?: number;
      currency?: string;
      recentTransactions?: unknown[];
      transactionCount?: number;
      float?: { balance: number; currency: string };
    };

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    const normalized = {
      float:
        data.float ??
        (typeof data.floatBalance === "number"
          ? {
              balance: data.floatBalance,
              currency: data.currency ?? (rail === "bank" ? "KES" : "KES"),
            }
          : undefined),
      transactionCount:
        data.transactionCount ??
        (Array.isArray(data.recentTransactions)
          ? data.recentTransactions.length
          : undefined),
    };

    return NextResponse.json(normalized, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Simulator unreachable." },
      { status: 503 }
    );
  }
}
