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
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Simulator unreachable." },
      { status: 503 }
    );
  }
}
