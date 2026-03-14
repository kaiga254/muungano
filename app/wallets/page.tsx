"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  country: string;
  currency: string;
  currentBalance: number;
};

const SUPPORTED_CURRENCIES = ["KES", "MWK", "USD"] as const;

const CURRENCY_FLAGS: Record<string, string> = {
  KES: "🇰🇪",
  MWK: "🇲🇼",
  USD: "🇺🇸",
};

const ACCOUNT_TYPE_LABELS: Record<FundingAccount["type"], string> = {
  bank: "Bank Accounts",
  mobile_money: "Mobile Money Accounts",
};

function formatBalance(amount: string, currency: string): string {
  const num = Number(amount) / 100;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function WalletsPage() {
  const router = useRouter();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [fundingAccounts, setFundingAccounts] = useState<FundingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<string>("KES");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadWallets = async () => {
    setLoading(true);
    try {
      const [walletsRes, accountsRes] = await Promise.all([
        fetch("/api/wallets"),
        fetch("/api/funding-accounts"),
      ]);

      if (walletsRes.status === 401 || accountsRes.status === 401) {
        router.push("/login");
        return;
      }

      const walletData = (await walletsRes.json()) as {
        wallets?: Wallet[];
        error?: string;
      };
      const accountsData = (await accountsRes.json()) as {
        accounts?: FundingAccount[];
        error?: string;
      };

      if (walletsRes.ok) setWallets(walletData.wallets ?? []);
      if (accountsRes.ok) setFundingAccounts(accountsData.accounts ?? []);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWallets();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const existingCurrencies = wallets.map((w) => w.currency);
  const availableCurrencies = SUPPORTED_CURRENCIES.filter(
    (c) => !existingCurrencies.includes(c),
  );
  const bankAccounts = fundingAccounts.filter(
    (account) => account.type === "bank",
  );
  const mobileAccounts = fundingAccounts.filter(
    (account) => account.type === "mobile_money",
  );

  useEffect(() => {
    if (availableCurrencies.length === 0) {
      return;
    }

    if (
      !availableCurrencies.includes(
        selectedCurrency as (typeof SUPPORTED_CURRENCIES)[number],
      )
    ) {
      setSelectedCurrency(availableCurrencies[0]);
    }
  }, [availableCurrencies, selectedCurrency]);

  const handleCreate = async () => {
    setError(null);
    setSuccess(null);
    setCreating(true);
    try {
      if (
        !availableCurrencies.includes(
          selectedCurrency as (typeof SUPPORTED_CURRENCIES)[number],
        )
      ) {
        throw new Error("Please select an available currency.");
      }

      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: selectedCurrency }),
      });
      const d = (await res.json()) as { wallet?: Wallet; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Failed to create wallet.");
      setSuccess(`${selectedCurrency} wallet created.`);
      await loadWallets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Wallets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each currency has its own wallet and ledger.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading wallets…</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {wallets.map((w) => (
            <Card key={w.id} className="border-border/70 bg-card/95">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">
                      {CURRENCY_FLAGS[w.currency] ?? "💰"}
                    </span>
                    <span className="font-semibold">{w.currency}</span>
                  </div>
                  <Badge
                    variant={w.status === "active" ? "secondary" : "outline"}
                    className="text-xs"
                  >
                    {w.status}
                  </Badge>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Balance</div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {formatBalance(w.balance, w.currency)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {w.currency}
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      router.push(
                        `/deposit?walletId=${w.id}&currency=${w.currency}`,
                      )
                    }
                  >
                    Deposit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/send?currency=${w.currency}`)}
                  >
                    Send
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      router.push(`/transfer?from=${w.id}`)
                    }
                  >
                    Transfer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && availableCurrencies.length > 0 && (
        <Card className="border-border/70 bg-card/95">
          <CardContent className="p-5 space-y-4">
            <h2 className="font-semibold">Open a new wallet</h2>
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="currency">Currency</Label>
                <select
                  id="currency"
                  title="Currency"
                  value={selectedCurrency}
                  onChange={(e) => setSelectedCurrency(e.target.value)}
                  className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {availableCurrencies.map((c) => (
                    <option key={c} value={c}>
                      {CURRENCY_FLAGS[c]} {c}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={() => void handleCreate()} disabled={creating}>
                {creating ? "Creating…" : "Create wallet"}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}
          </CardContent>
        </Card>
      )}

      {!loading && fundingAccounts.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Linked Funding Accounts
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your external source-of-funds accounts across countries and rails.
            </p>
          </div>

          {(
            [
              ["bank", bankAccounts],
              ["mobile_money", mobileAccounts],
            ] as const
          ).map(([type, accounts]) =>
            accounts.length > 0 ? (
              <div key={type} className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {ACCOUNT_TYPE_LABELS[type]}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {accounts.map((account) => (
                    <Card
                      key={account.id}
                      className="border-border/70 bg-card/95"
                    >
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xl">
                                {CURRENCY_FLAGS[account.currency] ?? "💳"}
                              </span>
                              <span className="font-semibold">
                                {account.providerName}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {account.accountName}
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {account.country}
                          </Badge>
                        </div>

                        <div>
                          <div className="text-xs text-muted-foreground">
                            Account / Identifier
                          </div>
                          <div className="font-mono text-sm break-all">
                            {account.accountIdentifier}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-muted-foreground">
                            Available balance
                          </div>
                          <div className="text-2xl font-semibold tabular-nums">
                            {formatBalance(
                              String(account.currentBalance),
                              account.currency,
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {account.currency}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}
    </main>
  );
}
