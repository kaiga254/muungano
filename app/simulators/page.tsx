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

type FundingAccount = {
  id: string;
  type: "bank" | "mobile_money";
  providerName: string;
  accountName: string;
  accountIdentifier: string;
  accountRef?: string;
  country: string;
  currency: string;
  currentBalance: number;
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

const ACCOUNT_TYPE_LABELS: Record<FundingAccount["type"], string> = {
  bank: "Bank Accounts",
  mobile_money: "Mobile Money Accounts",
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

  useEffect(() => {
    void loadState();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [fundingAccounts, setFundingAccounts] = useState<FundingAccount[]>([]);
  const [fundingAccountId, setFundingAccountId] = useState("");
  const [simulatorPin, setSimulatorPin] = useState("123456");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (wallets.length === 0) {
      setWalletId("");
      return;
    }

    const exists = wallets.some((wallet) => wallet.id === walletId);
    if (!exists) {
      setWalletId(wallets[0].id);
    }
  }, [wallets, walletId]);

  const selectedWallet = wallets.find((wallet) => wallet.id === walletId);

  useEffect(() => {
    if (!selectedWallet?.currency) return;

    void (async () => {
      setLoadingAccounts(true);
      try {
        const res = await fetch(
          `/api/funding-accounts?currency=${selectedWallet.currency}`,
        );
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.ok) {
          const d = (await res.json()) as { accounts?: FundingAccount[] };
          const next = d.accounts ?? [];
          setFundingAccounts(next);
          const filtered = next.filter((account) => account.type === method);
          setFundingAccountId(filtered[0]?.id ?? "");
        }
      } finally {
        setLoadingAccounts(false);
      }
    })();
  }, [selectedWallet?.currency, method, router]);

  const filteredAccounts = fundingAccounts.filter(
    (account) => account.type === method,
  );

  const handleDeposit = async () => {
    setError(null);
    setResult(null);

    if (!walletId) {
      setError("Select a destination wallet before sending a test deposit.");
      return;
    }

    setLoading(true);
    try {
      const wallet = wallets.find((w) => w.id === walletId);
      const amountMinor = Math.round(parseFloat(amountMajor) * 100);
      const res = await fetch("/api/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId,
          fundingAccountId,
          amount: amountMinor,
          currency: wallet?.currency ?? "KES",
          method,
          simulatorPin,
        }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const d = (await res.json()) as {
        deposit?: { id: string };
        error?: string;
      };
      if (!res.ok) throw new Error(d.error ?? "Failed.");
      setResult(
        `Deposit initiated (ID: ${d.deposit?.id ?? "?"}). The simulator will send a callback in ~1–2 s to credit your wallet.`,
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
            {wallets.length === 0 ? (
              <option value="">No wallets available</option>
            ) : (
              <option value="" disabled>
                Choose wallet…
              </option>
            )}
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
            <option value="mobile_money">Mobile Money Transfer</option>
            <option value="bank">Bank Transfer</option>
          </select>
        </div>

        <div className="grid gap-2">
          <Label>Funding account</Label>
          <select
            value={fundingAccountId}
            onChange={(e) => setFundingAccountId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            {filteredAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.providerName} —{" "}
                {account.accountRef ?? account.accountIdentifier}
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
            maxLength={6}
            value={simulatorPin}
            onChange={(e) =>
              setSimulatorPin(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="123456"
          />
        </div>

        {result && (
          <p className="text-sm text-green-700 dark:text-green-400">{result}</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          disabled={
            loading ||
            loadingAccounts ||
            wallets.length === 0 ||
            !fundingAccountId ||
            simulatorPin.length < 6
          }
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
  const [fundingAccounts, setFundingAccounts] = useState<FundingAccount[]>([]);

  useEffect(() => {
    void (async () => {
      const [walletRes, accountRes] = await Promise.all([
        fetch("/api/wallets"),
        fetch("/api/funding-accounts"),
      ]);
      if (walletRes.status === 401 || accountRes.status === 401) {
        router.push("/login");
        return;
      }
      if (walletRes.ok) {
        const d = (await walletRes.json()) as { wallets?: Wallet[] };
        setWallets(d.wallets ?? []);
      }
      if (accountRes.ok) {
        const d = (await accountRes.json()) as { accounts?: FundingAccount[] };
        setFundingAccounts(d.accounts ?? []);
      }
    })();
  }, [router]);

  const bankAccounts = fundingAccounts.filter(
    (account) => account.type === "bank",
  );
  const mobileAccounts = fundingAccounts.filter(
    (account) => account.type === "mobile_money",
  );

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

      <Card className="border-border/70 bg-card/95">
        <CardHeader>
          <CardTitle className="text-base">Linked Funding Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(
            [
              ["bank", bankAccounts],
              ["mobile_money", mobileAccounts],
            ] as const
          ).map(([type, accounts]) =>
            accounts.length > 0 ? (
              <div key={type} className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {ACCOUNT_TYPE_LABELS[type]}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {account.providerName}
                        </p>
                        <Badge variant="outline" className="text-xs">
                          {account.country}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {account.accountIdentifier}
                      </p>
                      <p className="text-sm font-semibold tabular-nums mt-1">
                        {fmt(String(account.currentBalance), account.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </CardContent>
      </Card>

      <TestDepositForm wallets={wallets} />

      <p className="text-xs text-muted-foreground">
        Deposits are routed through the real{" "}
        <code className="font-mono">/api/deposits</code> endpoint. The simulator
        automatically fires a webhook callback to confirm and credit your
        wallet, replicating a live bank or M-Pesa transaction.
      </p>
    </main>
  );
}
