"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type Wallet = {
	id: string;
	currency: string;
	balance: string;
};

type SimState = {
	float?: { balance: number; currency: string };
	transactionCount?: number;
};

type SimName = "mpesa" | "bank";

const SIM_LABELS: Record<SimName, string> = {
	mpesa: "M-Pesa Simulator",
	bank: "Bank Simulator",
};

function fmt(amount: string, currency: string): string {
	return (
		(Number(amount) / 100).toLocaleString(undefined, {
			minimumFractionDigits: 2,
		}) +
		" " +
		currency
	);
}

function SimulatorPanel({ name }: { name: SimName }) {
	const [state, setState] = useState<SimState | null>(null);
	const [statError, setStatError] = useState<string | null>(null);

	const loadState = async () => {
		try {
			const res = await fetch(`/api/simulators/${name}/state`);
			if (res.ok) setState((await res.json()) as SimState);
			else setStatError("Simulator returned error.");
		} catch {
			setStatError("Simulator offline.");
		}
	};

	useEffect(() => { void loadState(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<Card className="border-border/70">
			<CardHeader className="pb-2">
				<CardTitle className="text-base flex items-center justify-between">
					{SIM_LABELS[name]}
					<Badge variant="outline" className="text-xs">
						{statError ? "Offline" : "Online"}
					</Badge>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				{state?.float && (
					<p className="text-sm">
						Float:{" "}
						<span className="font-semibold">
							{state.float.balance.toLocaleString()} {state.float.currency}
						</span>
					</p>
				)}
				{state?.transactionCount !== undefined && (
					<p className="text-sm text-muted-foreground">
						{state.transactionCount} transaction
						{state.transactionCount !== 1 ? "s" : ""} processed
					</p>
				)}
				{statError && <p className="text-xs text-destructive">{statError}</p>}
				<Button variant="outline" size="sm" onClick={() => void loadState()}>
					Refresh
				</Button>
			</CardContent>
		</Card>
	);
}

function TestDepositForm({ wallets }: { wallets: Wallet[] }) {
	const router = useRouter();
	const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
	const [amountMajor, setAmountMajor] = useState("500");
	const [method, setMethod] = useState<"mobile_money" | "bank">("mobile_money");
	const [result, setResult] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleDeposit = async () => {
		setError(null);
		setResult(null);
		setLoading(true);
		try {
			const wallet = wallets.find((w) => w.id === walletId);
			const amountMinor = Math.round(parseFloat(amountMajor) * 100);
			const res = await fetch("/api/deposits", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					walletId,
					amount: amountMinor,
					currency: wallet?.currency ?? "KES",
					method,
				}),
			});
			if (res.status === 401) { router.push("/login"); return; }
			const d = (await res.json()) as {
				deposit?: { id: string };
				error?: string;
			};
			if (!res.ok) throw new Error(d.error ?? "Failed.");
			setResult(
				`Deposit initiated (ID: ${d.deposit?.id ?? "?"}). The simulator will send a callback in ~1–2 s to credit your wallet.`
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Error.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<Card className="border-border/70 bg-card/95">
			<CardHeader>
				<CardTitle className="text-base">Trigger a Test Deposit</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-2">
					<Label>Destination Wallet</Label>
					<select
						value={walletId}
						onChange={(e) => setWalletId(e.target.value)}
						className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
					>
						{wallets.map((w) => (
							<option key={w.id} value={w.id}>
								{w.currency} — {fmt(w.balance, w.currency)}
							</option>
						))}
					</select>
				</div>

				<div className="grid gap-2">
					<Label htmlFor="test-amount">Amount</Label>
					<Input
						id="test-amount"
						type="number"
						min="1"
						step="1"
						value={amountMajor}
						onChange={(e) => setAmountMajor(e.target.value)}
					/>
				</div>

				<div className="grid gap-2">
					<Label>Channel</Label>
					<select
						value={method}
						onChange={(e) =>
							setMethod(e.target.value as "mobile_money" | "bank")
						}
						className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
					>
						<option value="mobile_money">M-Pesa (mobile_money)</option>
						<option value="bank">Bank Transfer</option>
					</select>
				</div>

				{result && (
					<p className="text-sm text-green-700 dark:text-green-400">{result}</p>
				)}
				{error && <p className="text-sm text-destructive">{error}</p>}

				<Button
					disabled={loading || wallets.length === 0}
					onClick={() => void handleDeposit()}
				>
					{loading ? "Initiating…" : "Send Test Deposit"}
				</Button>
			</CardContent>
		</Card>
	);
}

export default function SimulatorsPage() {
	const router = useRouter();
	const [wallets, setWallets] = useState<Wallet[]>([]);

	useEffect(() => {
		void (async () => {
			const res = await fetch("/api/wallets");
			if (res.status === 401) {
				router.push("/login");
				return;
			}
			if (res.ok) {
				const d = (await res.json()) as { wallets?: Wallet[] };
				setWallets(d.wallets ?? []);
			}
		})();
	}, [router]);

	return (
		<main className="mx-auto w-full max-w-3xl px-4 py-8 space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Simulator Control Panel
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Trigger test deposits and inspect simulator state.
				</p>
			</div>

			<div className="grid sm:grid-cols-2 gap-4">
				<SimulatorPanel name="mpesa" />
				<SimulatorPanel name="bank" />
			</div>

			<Separator />

			<TestDepositForm wallets={wallets} />

			<p className="text-xs text-muted-foreground">
				Deposits are routed through the real{" "}
				<code className="font-mono">/api/deposits</code> endpoint. The simulator
				automatically fires a webhook callback to confirm and credit your wallet,
				replicating a live bank or M-Pesa transaction.
			</p>
		</main>
	);
}
