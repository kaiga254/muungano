"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";

type Wallet = {
  id: string;
  currency: string;
  status: string;
  balance: string;
};

type Payment = {
  id: string;
  receiverIdentifier: string;
  currency: string;
  amount: number;
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
  const [kycStatus, setKycStatus] = useState<
    "pending" | "verified" | "rejected" | "not_submitted"
  >("not_submitted");
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [walletsRes, paymentsRes, kycRes, pinRes] = await Promise.all([
          fetch("/api/wallets"),
          fetch("/api/payments/history?limit=5"),
          fetch("/api/kyc/status"),
          fetch("/api/auth/pin"),
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
            profile?: {
              kyc_tier?: number;
              status?: "pending" | "verified" | "rejected";
            };
          };
          setKycTier(d.profile?.kyc_tier ?? 0);
          setKycStatus(d.profile?.status ?? "not_submitted");
        }
        if (pinRes.ok) {
          const d = (await pinRes.json()) as { pinSet: boolean };
          setPinSet(d.pinSet);
        }
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

  const handleSetPin = async (e: FormEvent) => {
    e.preventDefault();
    setPinError(null);
    if (!/^\d{6}$/.test(newPin)) {
      setPinError("PIN must be exactly 6 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      setPinError("PINs do not match.");
      return;
    }
    setPinSubmitting(true);
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: newPin }),
      });
      const d = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Failed to set PIN.");
      setPinSet(true);
      setPinSuccess("PIN set successfully!");
      setNewPin("");
      setConfirmPin("");
      setTimeout(() => {
        setShowPinDialog(false);
        setPinSuccess(null);
      }, 1500);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Error.");
    } finally {
      setPinSubmitting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="secondary" className="mb-2 rounded-full px-3 py-1">
            Interledger Wallet
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            Welcome back
            {session?.fullName ? `, ${session.fullName.split(" ")[0]}` : ""}
          </h1>
          {session?.ilpAddress && (
            <p className="mt-1 text-xs text-muted-foreground font-mono">
              {session.ilpAddress}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setNewPin("");
              setConfirmPin("");
              setPinError(null);
              setPinSuccess(null);
              setShowPinDialog(true);
            }}
          >
            {pinSet ? "Change PIN" : "Set PIN"}
          </Button>
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

      {/* PIN banner */}
      {pinSet === false && (
        <Card className="border-blue-500/40 bg-blue-500/5">
          <CardContent className="flex items-center justify-between p-4 text-sm">
            <span className="text-blue-700 dark:text-blue-400">
              Set a 6-digit transaction PIN to authorize payments and
              withdrawals.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowPinDialog(true)}
            >
              Set PIN →
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KYC banner */}
      {kycStatus !== "verified" && kycTier === 0 && (
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
          <div className="text-sm text-muted-foreground">Loading wallets…</div>
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
              <Link key={w.id} href={`/wallets?currency=${w.currency}`}>
                <Card className="cursor-pointer hover:border-primary/50 transition-colors border-border/70 bg-card/95">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">
                        {CURRENCY_FLAGS[w.currency] ?? "💰"}
                      </span>
                      <span className="text-sm font-medium text-muted-foreground">
                        {w.currency}
                      </span>
                      {w.status !== "active" && (
                        <Badge variant="secondary" className="text-xs">
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
              href: "/transfer",
              desc: "FX swap wallets",
            },
          ].map((action) => (
            <Link key={action.href} href={action.href}>
              <Card className="cursor-pointer hover:border-primary/50 transition-colors border-border/70">
                <CardContent className="p-4">
                  <div className="font-medium">{action.label}</div>
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
              <div className="p-6 text-sm text-muted-foreground">Loading…</div>
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
                        {p.receiverIdentifier}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium tabular-nums">
                        -{formatBalance(String(p.amount), p.currency)}
                      </div>
                      <Badge
                        variant={
                          p.status === "completed" ? "secondary" : "outline"
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
      {/* PIN Dialog */}
      <Dialog
        open={showPinDialog}
        onOpenChange={(open) => {
          setShowPinDialog(open);
          if (!open) {
            setPinError(null);
            setPinSuccess(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {pinSet ? "Change Transaction PIN" : "Set Transaction PIN"}
            </DialogTitle>
            <DialogDescription>
              Your PIN is required to authorize payments and withdrawals. Use 6
              digits.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => void handleSetPin(e)}
            className="space-y-4 pt-2"
          >
            <div className="grid gap-2">
              <Label htmlFor="new-pin">{pinSet ? "New PIN" : "PIN"}</Label>
              <Input
                id="new-pin"
                type="password"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={newPin}
                onChange={(e) =>
                  setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="••••••"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm-pin">
                {pinSet ? "Confirm new PIN" : "Confirm PIN"}
              </Label>
              <Input
                id="confirm-pin"
                type="password"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={confirmPin}
                onChange={(e) =>
                  setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="••••••"
                autoComplete="new-password"
                required
              />
            </div>
            {pinError && <p className="text-sm text-destructive">{pinError}</p>}
            {pinSuccess && (
              <p className="text-sm text-green-600 dark:text-green-400">
                {pinSuccess}
              </p>
            )}
            <Button
              type="submit"
              disabled={pinSubmitting || newPin.length < 6}
              className="w-full"
            >
              {pinSubmitting ? "Saving…" : pinSet ? "Update PIN" : "Set PIN"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
