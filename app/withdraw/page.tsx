"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Wallet = {
	id: string;
	currency: string;
	status: string;
	balance: string;
};

const METHODS = [
	{ value: "bank", label: "Bank Transfer" },
	{ value: "mobile_money", label: "Mobile Money (M-Pesa)" },
];

function formatBalance(amount: string): string {
	return (Number(amount) / 100).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

export default function WithdrawPage() {
	const router = useRouter();
	const [wallets, setWallets] = useState<Wallet[]>([]);
	const [walletId, setWalletId] = useState("");
	const [amountMajor, setAmountMajor] = useState("");
	const [method, setMethod] = useState("mobile_money");
	const [destinationAccount, setDestinationAccount] = useState("");
	const [pin, setPin] = useState("");
	const [loading, setLoading] = useState(false);
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
				if (active.length > 0) setWalletId(active[0].id);
			}
		})();
	}, [router]);

	const sourceWallet = wallets.find((w) => w.id === walletId);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		setSuccess(null);
		setLoading(true);
		try {
			const amountMinor = Math.round(parseFloat(amountMajor) * 100);
			const res = await fetch("/api/withdrawals", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					walletId,
					amount: amountMinor,
					destinationType: method,
					destinationDetails: {
						account: destinationAccount,
						label: method === "bank" ? "bank_account" : "phone_number",
					},
					pin,
				}),
			});
			const d = (await res.json()) as { message?: string; error?: string };
			if (!res.ok) throw new Error(d.error ?? "Withdrawal failed.");
			setSuccess(`Withdrawal initiated. ${d.message ?? ""}`);
			setAmountMajor("");
			setPin("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Error.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<main className="mx-auto w-full max-w-lg px-4 py-8 space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Withdraw Funds
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Send money to your bank account or mobile wallet.
				</p>
			</div>

			{success && (
				<Card className="border-green-500/40 bg-green-500/5">
					<CardContent className="p-4 text-sm text-green-700 dark:text-green-400">{success}</CardContent>
				</Card>
			)}

			<Card className="border-border/70 bg-card/95">
				<CardContent className="p-5">
					<form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
						<div className="grid gap-2">
							<Label>Wallet</Label>
							<select
								value={walletId}
								onChange={(e) => setWalletId(e.target.value)}
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
							>
								{wallets.map((w) => (
									<option key={w.id} value={w.id}>
										{w.currency} — {formatBalance(w.balance)} {w.currency}
									</option>
								))}
							</select>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="amount">
								Amount ({sourceWallet?.currency ?? "—"})
							</Label>
							<Input
								id="amount"
								type="number"
								min="1"
								step="1"
								value={amountMajor}
								onChange={(e) => setAmountMajor(e.target.value)}
								placeholder="500"
								required
							/>
						</div>

						<div className="grid gap-2">
							<Label>Method</Label>
							<select
								value={method}
								onChange={(e) => setMethod(e.target.value)}
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
							>
								{METHODS.map((m) => (
									<option key={m.value} value={m.value}>{m.label}</option>
								))}
							</select>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="dest-account">
								{method === "bank" ? "Account number / IBAN" : "Phone number"}
							</Label>
							<Input
								id="dest-account"
								value={destinationAccount}
								onChange={(e) => setDestinationAccount(e.target.value)}
								placeholder={method === "bank" ? "1234567890" : "+254700000000"}
								required
							/>
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
								required
							/>
						</div>

						{error && <p className="text-sm text-destructive">{error}</p>}

						<Button
							type="submit"
							disabled={loading || pin.length < 4}
							className="w-full"
						>
							{loading ? "Processing…" : "Withdraw"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</main>
	);
}
