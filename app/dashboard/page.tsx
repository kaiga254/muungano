"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";

type Wallet = {
	id: string;
	currency: string;
	status: string;
	balance: string;
};

type Payment = {
	id: string;
	destinationPointer: string;
	sourceCurrency: string;
	sourceAmount: string;
	status: string;
	createdAt: string;
};

const CURRENCY_FLAGS: Record<string, string> = {
	KES: "🇰🇪",
	MWK: "🇲🇼",
	USD: "🇺🇸",
};

function formatBalance(amount: string, currency: string): string {
	const num = Number(amount) / 100;
	return `${currency} ${num.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

export default function DashboardPage() {
	const router = useRouter();
	const { session } = useAuth();
	const [wallets, setWallets] = useState<Wallet[]>([]);
	const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
	const [loading, setLoading] = useState(true);
	const [kycTier, setKycTier] = useState<number>(0);

	useEffect(() => {
		const load = async () => {
			setLoading(true);
			try {
				const [walletsRes, paymentsRes, kycRes] = await Promise.all([
					fetch("/api/wallets"),
					fetch("/api/payments/history?limit=5"),
					fetch("/api/kyc/status"),
				]);

				if (walletsRes.status === 401) {
					router.push("/login");
					return;
				}

				if (walletsRes.ok) {
					const d = (await walletsRes.json()) as { wallets?: Wallet[] };
					setWallets(d.wallets ?? []);
				}
				if (paymentsRes.ok) {
					const d = (await paymentsRes.json()) as { payments?: Payment[] };
					setRecentPayments(d.payments ?? []);
				}
				if (kycRes.ok) {
					const d = (await kycRes.json()) as {
						profile?: { kyc_tier?: number };
					};
					setKycTier(d.profile?.kyc_tier ?? 0);
				}
			} catch {
				// non-critical
			} finally {
				setLoading(false);
			}
		};
		void load();
	}, [router]);

	return (
		<main className="mx-auto w-full max-w-5xl px-4 py-8 space-y-6">
			{/* Header */}
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<Badge
						variant="secondary"
						className="mb-2 rounded-full px-3 py-1"
					>
						Interledger Wallet
					</Badge>
					<h1 className="text-3xl font-semibold tracking-tight">
						Welcome back
						{session?.fullName
							? `, ${session.fullName.split(" ")[0]}`
							: ""}
					</h1>
					{session?.ilpAddress && (
						<p className="mt-1 text-xs text-muted-foreground font-mono">
							{session.ilpAddress}
						</p>
					)}
				</div>
				<div className="flex gap-2">
					<Link href="/kyc">
						<Button variant="outline" size="sm">
							KYC
						</Button>
					</Link>
					<Link href="/deposit">
						<Button size="sm">+ Deposit</Button>
					</Link>
				</div>
			</div>

			{/* KYC banner */}
			{kycTier === 0 && (
				<Card className="border-amber-500/40 bg-amber-500/5">
					<CardContent className="flex items-center justify-between p-4 text-sm">
						<span className="text-amber-700 dark:text-amber-400">
							Complete Tier-1 KYC to unlock cross-border transfers.
						</span>
						<Link href="/kyc">
							<Button size="sm" variant="outline">
								Verify now →
							</Button>
						</Link>
					</CardContent>
				</Card>
			)}

			{/* Wallets grid */}
			<div>
				<div className="mb-3 flex items-center justify-between">
					<h2 className="font-semibold">My Wallets</h2>
					<Link href="/wallets">
						<Button variant="ghost" size="sm">
							View all →
						</Button>
					</Link>
				</div>
				{loading ? (
					<div className="text-sm text-muted-foreground">
						Loading wallets…
					</div>
				) : wallets.length === 0 ? (
					<Card className="border-dashed border-border/70">
						<CardContent className="flex flex-col items-center gap-3 p-8 text-center">
							<p className="text-muted-foreground text-sm">
								No wallets yet. Create one to get started.
							</p>
							<Link href="/wallets">
								<Button>Create wallet</Button>
							</Link>
						</CardContent>
					</Card>
				) : (
					<div className="grid gap-3 sm:grid-cols-3">
						{wallets.map((w) => (
							<Link
								key={w.id}
								href={`/wallets?currency=${w.currency}`}
							>
								<Card className="cursor-pointer hover:border-primary/50 transition-colors border-border/70 bg-card/95">
									<CardContent className="p-5">
										<div className="flex items-center gap-2 mb-2">
											<span className="text-xl">
												{CURRENCY_FLAGS[w.currency] ??
													"💰"}
											</span>
											<span className="text-sm font-medium text-muted-foreground">
												{w.currency}
											</span>
											{w.status !== "active" && (
												<Badge
													variant="secondary"
													className="text-xs"
												>
													{w.status}
												</Badge>
											)}
										</div>
										<div className="text-2xl font-semibold tabular-nums">
											{formatBalance(w.balance, w.currency)}
										</div>
									</CardContent>
								</Card>
							</Link>
						))}
					</div>
				)}
			</div>

			{/* Quick actions */}
			<div>
				<h2 className="font-semibold mb-3">Quick Actions</h2>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
					{[
						{
							label: "Send",
							href: "/send",
							desc: "Cross-border ILP",
						},
						{
							label: "Deposit",
							href: "/deposit",
							desc: "Bank or M-Pesa",
						},
						{
							label: "Withdraw",
							href: "/withdraw",
							desc: "Back to account",
						},
						{
							label: "Convert",
							href: "/wallets",
							desc: "FX swap wallets",
						},
					].map((action) => (
						<Link key={action.href} href={action.href}>
							<Card className="cursor-pointer hover:border-primary/50 transition-colors border-border/70">
								<CardContent className="p-4">
									<div className="font-medium">
										{action.label}
									</div>
									<div className="text-xs text-muted-foreground mt-0.5">
										{action.desc}
									</div>
								</CardContent>
							</Card>
						</Link>
					))}
				</div>
			</div>

			{/* Recent payments */}
			<div>
				<div className="mb-3 flex items-center justify-between">
					<h2 className="font-semibold">Recent Payments</h2>
					<Link href="/history">
						<Button variant="ghost" size="sm">
							View all →
						</Button>
					</Link>
				</div>
				<Card className="border-border/70 bg-card/95">
					<CardContent className="p-0">
						{loading ? (
							<div className="p-6 text-sm text-muted-foreground">
								Loading…
							</div>
						) : recentPayments.length === 0 ? (
							<div className="p-6 text-center text-sm text-muted-foreground">
								No payments yet.
							</div>
						) : (
							<div className="divide-y divide-border/60">
								{recentPayments.map((p) => (
									<div
										key={p.id}
										className="flex items-center justify-between px-5 py-3 text-sm"
									>
										<div>
											<div className="font-medium truncate max-w-48">
												{p.destinationPointer}
											</div>
											<div className="text-xs text-muted-foreground mt-0.5">
												{new Date(
													p.createdAt,
												).toLocaleDateString()}
											</div>
										</div>
										<div className="text-right">
											<div className="font-medium tabular-nums">
												-{formatBalance(p.sourceAmount, p.sourceCurrency)}
											</div>
											<Badge
												variant={
													p.status === "completed"
														? "secondary"
														: "outline"
												}
												className="text-xs mt-0.5"
											>
												{p.status}
											</Badge>
										</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
