"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

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

type DepositResult = {
  deposit: {
    id: string;
    status: string;
    amount: string;
    currency: string;
    method: string;
  };
  instructions: Record<string, string>;
};

function DepositForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [walletId, setWalletId] = useState(searchParams.get("walletId") ?? "");
  const [currency, setCurrency] = useState(
    searchParams.get("currency") ?? "KES",
  );
  const [amountMajor, setAmountMajor] = useState("");
  const [method, setMethod] = useState("mobile_money");
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [result, setResult] = useState<DepositResult | null>(null);
  const [fundingAccounts, setFundingAccounts] = useState<FundingAccount[]>([]);
  const [fundingAccountId, setFundingAccountId] = useState("");
  const [simulatorPin, setSimulatorPin] = useState("123456");
  const [error, setError] = useState<string | null>(null);

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
        if (!walletId && active.length > 0) {
          setWalletId(active[0].id);
          setCurrency(active[0].currency);
        }
      }
    })();
  }, [router, walletId]);

  useEffect(() => {
    if (!currency) return;
    void (async () => {
      setLoadingAccounts(true);
      try {
        const res = await fetch(`/api/funding-accounts?currency=${currency}`);
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
  }, [currency, router]);

  const selectedFundingAccount = fundingAccounts.find(
    (account) => account.id === fundingAccountId,
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!fundingAccountId) {
        throw new Error("Select a funding account before initiating deposit.");
      }
      const amountMinor = Math.round(parseFloat(amountMajor) * 100);
      const res = await fetch("/api/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId: walletId || wallets[0]?.id,
          fundingAccountId,
          amount: amountMinor,
          currency,
          method: selectedFundingAccount?.type ?? method,
          simulatorPin,
        }),
      });
      const d = (await res.json()) as DepositResult & { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Failed to initiate deposit.");
      setResult(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error.");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <Card className="border-border/70 bg-card/95">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Deposit Instructions</h2>
            <Badge variant="secondary">{result.deposit.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Your deposit of{" "}
            <strong>
              {currency} {amountMajor}
            </strong>{" "}
            via <strong>{method}</strong> is pending. Follow the instructions
            below:
          </p>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-2 text-sm">
            {Object.entries(result.instructions).map(([key, val]) => (
              <div key={key} className="flex justify-between gap-4">
                <span className="text-muted-foreground capitalize">
                  {key.replace(/_/g, " ")}
                </span>
                <span className="font-medium font-mono text-right break-all">
                  {String(val)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            The simulator will automatically confirm your deposit within
            seconds.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
              setAmountMajor("");
            }}
          >
            Make another deposit
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-card/95">
      <CardContent className="p-5">
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="grid gap-2">
            <Label>Wallet</Label>
            <select
              value={walletId}
              onChange={(e) => {
                setWalletId(e.target.value);
                const w = wallets.find((w) => w.id === e.target.value);
                if (w) setCurrency(w.currency);
              }}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.currency} wallet
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="amount">Amount ({currency})</Label>
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
            <Label>Funding account</Label>
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
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
            <Label htmlFor="sim-pin">Simulator PIN</Label>
            <Input
              id="sim-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={simulatorPin}
              onChange={(e) =>
                setSimulatorPin(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="123456"
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            disabled={loading || loadingAccounts || !fundingAccountId}
            className="w-full"
          >
            {loading ? "Initiating…" : "Initiate deposit"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function DepositPage() {
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Deposit Funds</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Top up your wallet via bank transfer or mobile money.
        </p>
      </div>
      <Suspense
        fallback={<div className="text-sm text-muted-foreground">Loading…</div>}
      >
        <DepositForm />
      </Suspense>
    </main>
  );
}
