import { NextResponse } from "next/server";
import { rafikiService } from "@/services/rafikiService";

type SendPaymentRequest = {
	quoteId: string;
	destinationPointer: string;
	amount: number;
	currency?: string;
};

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as Partial<SendPaymentRequest>;
		if (!body.quoteId || !body.destinationPointer || !body.amount) {
			return NextResponse.json(
				{ error: "quoteId, destinationPointer and amount are required" },
				{ status: 400 }
			);
		}

		const payment = await rafikiService.sendOutgoingPayment({
			quoteId: body.quoteId,
			destinationPointer: body.destinationPointer,
			amount: body.amount,
			currency: body.currency ?? "MWK",
		});

		const status = await rafikiService.monitorPaymentStatus(payment.id);
		return NextResponse.json({ payment, status });
	} catch (error) {
		return NextResponse.json(
			{
				error: "Failed to send payment",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 }
		);
	}
}
