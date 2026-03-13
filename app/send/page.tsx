"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type Wallet = {
	id: string;
	currency: string;
	status: string;
	balance: string;
};

type Quote = {
	id: string;
	sourceCurrency: string;
	destinationCurrency: string;
	sourceAmount: string;
	destinationAmount: string;
	exchangeRate: string;
	totalFee: string;
	expiresAt: string;
};

function formatAmount(amount: string, currency: string) {
	const num = Number(amount) / 100;
	return `${currency} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SendPage() {
	const router = useRouter();
	const [wallets, setWallets] = useState<Wallet[]>([]);
	const [sourceWalletId, setSourceWalletId] = useState("");
	const [destinationPointer, setDestinationPointer] = useState("");
	const [amountMajor, setAmountMajor] = useState("");
	const [receiverType, setReceiverType] = useState<"ilp_address" | "wallet_id">("ilp_address");
	const [pin, setPin] = useState("");
	const [quote, setQuote] = useState<Quote | null>(null);
	const [quoteLoading, setQuoteLoading] = useState(false);
	const [sendLoading, setSendLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	useEffect(() => {
		void (async () => {
			const res = await fetch("/api/wallets");
			if (res.status === 401) { router.push("/login"); return; }
			if (res.ok) {
				const d = (await res.json()) as { wallets?: Wallet[] };
				const active = (d.wallets ?? []).filter((w) => w.status === "active");
				setWallets(active);
				if (active.length > 0) setSourceWalletId(active[0].id);
			}
		})();
	}, [router]);

	const sourceWallet = wallets.find((w) => w.id === sourceWalletId);

	const handleGetQuote = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		setQuote(null);
		if (!sourceWallet || !amountMajor || !destinationPointer) return;
		setQuoteLoading(true);
		try {
			const amountMinor = Math.round(parseFloat(amountMajor) * 100);
			const res = await fetch("/api/quotes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sourceWalletId,
					sourceCurrency: sourceWallet.currency,
					destinationCurrency: sourceWallet.currency, // same unless user picks
					sourceAmount: amountMinor,
					destinationPointer,
					receiverType,
				}),
			});
			const d = (await res.json()) as { quote?: Quote; error?: string };
			if (!res.ok) throw new Error(d.error ?? "Failed to get quote.");
			setQuote(d.quote!);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Error.");
		} finally {
			setQuoteLoading(false);
		}
	};

	const handleSend = async () => {
		if (!quote || !pin) return;
		setError(null);
		setSendLoading(true);
		try {
			const res = await fetch("/api/payments/send", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					quoteId: quote.id,
					pin,
					receiverIdentifier: destinationPointer,
					receiverType,
					idempotencyKey: `send-${quote.id}`,
				}),
			});
			const d = (await res.json()) as { message?: string; error?: string };
			if (!res.ok) throw new Error(d.error ?? "Payment failed.");
			setSuccess("Payment sent successfully.");
			setQuote(null);
			setPin("");
			setAmountMajor("");
			setDestinationPointer("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Error.");
		} finally {
			setSendLoading(false);
		}
	};

	return (
		<main className="mx-auto w-full max-w-lg px-4 py-8 space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Send Payment
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Send to any ILP address on the Interledger network.
				</p>
			</div>

			{success ? (
				<Card className="border-green-500/40 bg-green-500/5">
					<CardContent className="p-5 text-sm text-green-700 dark:text-green-400">
						{success}
					</CardContent>
				</Card>
			) : null}

			{!quote ? (
				<Card className="border-border/70 bg-card/95">
					<CardContent className="p-5">
						<form onSubmit={(e) => void handleGetQuote(e)} className="space-y-4">
							<div className="grid gap-2">
								<Label>Source wallet</Label>
								<select
									value={sourceWalletId}
									onChange={(e) => setSourceWalletId(e.target.value)}
									className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								>
									{wallets.map((w) => (
										<option key={w.id} value={w.id}>
											{w.currency} — {formatAmount(w.balance, w.currency)}
										</option>
									))}
								</select>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="dest">Destination address</Label>
								<Input
									id="dest"
									value={destinationPointer}
									onChange={(e) => setDestinationPointer(e.target.value)}
									placeholder="g.muungano.abc123..."
									required
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="amount">Amount ({sourceWallet?.currency ?? "—"})</Label>
								<Input
									id="amount"
									type="number"
									min="0.01"
									step="0.01"
									value={amountMajor}
									onChange={(e) => setAmountMajor(e.target.value)}
									placeholder="100.00"
									required
								/>
							</div>

							{error && <p className="text-sm text-destructive">{error}</p>}

							<Button type="submit" disabled={quoteLoading} className="w-full">
								{quoteLoading ? "Getting quote…" : "Get quote"}
							</Button>
						</form>
					</CardContent>
				</Card>
			) : (
				<Card className="border-border/70 bg-card/95">
					<CardContent className="p-5 space-y-4">
						<h2 className="font-semibold">Confirm Payment</h2>
						<div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-2 text-sm">
							<div className="flex justify-between">
								<span className="text-muted-foreground">You send</span>
								<span className="font-medium tabular-nums">
									{formatAmount(quote.sourceAmount, quote.sourceCurrency)}
								</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Fee</span>
								<span className="font-medium tabular-nums">
									{formatAmount(quote.totalFee, quote.sourceCurrency)}
								</span>
							</div>
							<Separator className="my-1" />
							<div className="flex justify-between">
								<span className="text-muted-foreground">They receive</span>
								<span className="font-semibold tabular-nums">
									{formatAmount(quote.destinationAmount, quote.destinationCurrency)}
								</span>
							</div>
							<div className="flex justify-between text-xs text-muted-foreground">
								<span>Rate</span>
								<span>{quote.exchangeRate}</span>
							</div>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="pin">Transaction PIN</Label>
							<Input
								id="pin"
								type="password"
								maxLength={6}
								value={pin}
								onChange={(e) => setPin(e.target.value)}
								placeholder="••••••"
							/>
						</div>

						{error && <p className="text-sm text-destructive">{error}</p>}

						<div className="flex gap-2">
							<Button
								onClick={() => void handleSend()}
								disabled={sendLoading || pin.length < 4}
								className="flex-1"
							>
								{sendLoading ? "Sending…" : "Confirm & send"}
							</Button>
							<Button
								variant="outline"
								onClick={() => { setQuote(null); setError(null); }}
							>
								Cancel
							</Button>
						</div>
					</CardContent>
				</Card>
			)}
		</main>
	);
}
