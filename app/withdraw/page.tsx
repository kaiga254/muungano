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

type FundingAccount = {
  id: string;
  type: "bank" | "mobile_money";
  providerName: string;
  accountName: string;
  accountIdentifier: string;
  currency: string;
};

function formatBalance(amount: string): string {
  return (Number(amount) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function WithdrawPage() {
  const router = useRouter();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [fundingAccounts, setFundingAccounts] = useState<FundingAccount[]>([]);
  const [walletId, setWalletId] = useState("");
  const [amountMajor, setAmountMajor] = useState("");
  const [fundingAccountId, setFundingAccountId] = useState("");
  const [method, setMethod] = useState("mobile_money");
  const [pin, setPin] = useState("123456");
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/wallets");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.ok) {
        const d = (await res.json()) as { wallets?: Wallet[] };
        const active = (d.wallets ?? []).filter((w) => w.status === "active");
        setWallets(active);
        if (active.length > 0) setWalletId(active[0].id);
      }
    })();
  }, [router]);

  const sourceWallet = wallets.find((w) => w.id === walletId);
  const selectedFundingAccount = fundingAccounts.find(
    (account) => account.id === fundingAccountId,
  );

  useEffect(() => {
    if (!sourceWallet?.currency) return;

    void (async () => {
      setLoadingAccounts(true);
      try {
        const res = await fetch(
          `/api/funding-accounts?currency=${sourceWallet.currency}`,
        );
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.ok) {
          const d = (await res.json()) as { accounts?: FundingAccount[] };
          const accounts = d.accounts ?? [];
          setFundingAccounts(accounts);
          if (accounts.length > 0) {
            setFundingAccountId((prev) => {
              if (prev && accounts.some((account) => account.id === prev)) {
                return prev;
              }
              return accounts[0].id;
            });
            setMethod(accounts[0].type);
          } else {
            setFundingAccountId("");
          }
        }
      } finally {
        setLoadingAccounts(false);
      }
    })();
  }, [router, sourceWallet?.currency]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      if (!fundingAccountId) {
        throw new Error("Select a destination funding account.");
      }
      const amountMinor = Math.round(parseFloat(amountMajor) * 100);
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId,
          fundingAccountId,
          amount: amountMinor,
          destinationType: selectedFundingAccount?.type ?? method,
          pin,
        }),
      });
      const d = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Withdrawal failed.");
      setSuccess(`Withdrawal initiated. ${d.message ?? ""}`);
      setAmountMajor("");
      setPin("123456");
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
          <CardContent className="p-4 text-sm text-green-700 dark:text-green-400">
            {success}
          </CardContent>
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
              <Label>Destination funding account</Label>
              <select
                value={fundingAccountId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setFundingAccountId(nextId);
                  const account = fundingAccounts.find(
                    (item) => item.id === nextId,
                  );
                  if (account) {
                    setMethod(account.type);
                  }
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {fundingAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.providerName} — {account.accountIdentifier}
                  </option>
                ))}
              </select>
              {loadingAccounts ? (
                <p className="text-xs text-muted-foreground">
                  Loading funding accounts…
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pin">Transaction PIN</Label>
              <Input
                id="pin"
                type="password"
                maxLength={6}
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="••••••"
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              disabled={
                loading ||
                loadingAccounts ||
                pin.length < 6 ||
                !fundingAccountId
              }
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
