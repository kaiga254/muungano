import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { rafikiService } from "@/services/rafikiService";

type QuoteRequestBody = {
	sourceAmount: number;
	destinationPointer: string;
	sourceCurrency?: string;
	destinationCurrency?: string;
	destinationAmount?: number;
};

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as Partial<QuoteRequestBody>;
		if (!body.sourceAmount || !body.destinationPointer) {
			return NextResponse.json(
				{ error: "sourceAmount and destinationPointer are required" },
				{ status: 400 }
			);
		}

		const sourceCurrency = body.sourceCurrency ?? "MWK";
		const destinationCurrency = body.destinationCurrency ?? "KES";
		const destinationAmount =
			body.destinationAmount ?? Number((body.sourceAmount * env.mwkToKesRate).toFixed(2));

		const quote = await rafikiService.createQuote({
			sourceAmount: body.sourceAmount,
			sourceCurrency,
			destinationAmount,
			destinationCurrency,
			receiverWalletAddress: body.destinationPointer,
		});

		return NextResponse.json({ quote });
	} catch (error) {
		return NextResponse.json(
			{
				error: "Failed to create quote",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 }
		);
	}
}
