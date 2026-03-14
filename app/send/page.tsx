"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

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

type Quote = {
  id: string;
  sourceCurrency: string;
  destinationCurrency: string;
  sourceAmount: number;
  destinationAmount: number;
  exchangeRate: number;
  fees: { connector: number; muungano: number; total: number };
  expiresAt: string;
};

type RecipientSummary = Record<string, string>;

const QUOTE_MIN_SEND_WINDOW_SECONDS = 10;

function formatAmount(amount: number | string, currency: string) {
  const num = Number(amount) / 100;
  return `${currency} ${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function SendPage() {
  const router = useRouter();

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [sourceWalletId, setSourceWalletId] = useState("");
  const [amountMajor, setAmountMajor] = useState("");

  const [recipientType, setRecipientType] = useState<"mobile_money" | "bank">(
    "mobile_money",
  );
  const [recipientMode, setRecipientMode] = useState<
    "manual" | "linked_account"
  >("manual");

  const [fundingAccounts, setFundingAccounts] = useState<FundingAccount[]>([]);
  const [linkedFundingAccountId, setLinkedFundingAccountId] = useState("");

  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [recipientNumberOrAccount, setRecipientNumberOrAccount] = useState("");

  const [pin, setPin] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [recipientSummary, setRecipientSummary] =
    useState<RecipientSummary | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [quoteLifetimeSeconds, setQuoteLifetimeSeconds] = useState<
    number | null
  >(null);
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
        const activeWallets = (d.wallets ?? []).filter(
          (wallet) => wallet.status === "active",
        );
        setWallets(activeWallets);
        if (activeWallets.length > 0) {
          setSourceWalletId(activeWallets[0].id);
        }
      }
    })();
  }, [router]);

  const sourceWallet = wallets.find((wallet) => wallet.id === sourceWalletId);

  useEffect(() => {
    if (!sourceWallet?.currency) {
      setFundingAccounts([]);
      setLinkedFundingAccountId("");
      return;
    }

    void (async () => {
      const res = await fetch(
        `/api/funding-accounts?currency=${sourceWallet.currency}`,
      );
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.ok) {
        const d = (await res.json()) as { accounts?: FundingAccount[] };
        setFundingAccounts(d.accounts ?? []);
      }
    })();
  }, [sourceWallet?.currency, router]);

  const linkedCandidates = useMemo(
    () => fundingAccounts.filter((account) => account.type === recipientType),
    [fundingAccounts, recipientType],
  );

  useEffect(() => {
    if (recipientMode !== "linked_account") return;

    if (linkedCandidates.length === 0) {
      setLinkedFundingAccountId("");
      return;
    }

    setLinkedFundingAccountId((current) => {
      if (
        current &&
        linkedCandidates.some((account) => account.id === current)
      ) {
        return current;
      }
      return linkedCandidates[0].id;
    });
  }, [recipientMode, linkedCandidates]);

  useEffect(() => {
    if (!quote?.expiresAt) {
      setExpiresIn(null);
      setQuoteLifetimeSeconds(null);
      return;
    }

    const lifetime = Math.max(
      1,
      Math.floor((new Date(quote.expiresAt).getTime() - Date.now()) / 1000),
    );
    setQuoteLifetimeSeconds(lifetime);

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(quote.expiresAt).getTime() - Date.now()) / 1000),
      );
      setExpiresIn(remaining);
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [quote?.expiresAt]);

  const quoteTimeProgress = useMemo(() => {
    if (
      expiresIn === null ||
      quoteLifetimeSeconds === null ||
      quoteLifetimeSeconds <= 0
    ) {
      return 0;
    }

    return Math.min(100, Math.max(0, (expiresIn / quoteLifetimeSeconds) * 100));
  }, [expiresIn, quoteLifetimeSeconds]);

  const isQuoteExpiringSoon =
    expiresIn !== null && expiresIn < QUOTE_MIN_SEND_WINDOW_SECONDS;

  const refreshBalances = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/wallets");
      if (res.ok) {
        const d = (await res.json()) as { wallets?: Wallet[] };
        const activeWallets = (d.wallets ?? []).filter(
          (wallet) => wallet.status === "active",
        );
        setWallets(activeWallets);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleGetQuote = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setQuote(null);
    setRecipientSummary(null);

    if (!sourceWallet) {
      setError("Select a source wallet.");
      return;
    }

    if (!amountMajor) {
      setError("Enter an amount.");
      return;
    }

    if (recipientMode === "linked_account" && !linkedFundingAccountId) {
      setError("Select a linked recipient account.");
      return;
    }

    setQuoteLoading(true);
    try {
      const amountMinor = Math.round(parseFloat(amountMajor) * 100);
      const recipientDetails =
        recipientMode === "manual"
          ? recipientType === "bank"
            ? {
                bankName,
                accountName,
                accountNumber,
              }
            : {
                recipientNumber: recipientNumberOrAccount,
                recipientAccount: recipientNumberOrAccount,
              }
          : undefined;

      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceWalletId: sourceWallet.id,
          sourceCurrency: sourceWallet.currency,
          destinationCurrency: sourceWallet.currency,
          sourceAmount: amountMinor,
          recipientType,
          recipientMode,
          linkedFundingAccountId:
            recipientMode === "linked_account"
              ? linkedFundingAccountId
              : undefined,
          recipientDetails,
        }),
      });

      const data = (await res.json()) as {
        quote?: Quote;
        recipientSummary?: RecipientSummary;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to get quote.");
      }

      setQuote(data.quote ?? null);
      setRecipientSummary(data.recipientSummary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error.");
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleSend = async () => {
    if (!quote) return;

    if (isQuoteExpiringSoon) {
      setError("Quote is about to expire. Generate a new quote to continue.");
      return;
    }

    if (expiresIn !== null && expiresIn <= 0) {
      setError("Quote has expired. Generate a new quote.");
      return;
    }

    setError(null);
    setSendLoading(true);
    try {
      const res = await fetch("/api/payments/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: quote.id,
          pin,
          idempotencyKey: `send-${quote.id}`,
        }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Payment failed.");
      }

      setSuccess("Transfer completed.");
      setQuote(null);
      setRecipientSummary(null);
      setPin("");
      setAmountMajor("");
      setRecipientNumberOrAccount("");
      await refreshBalances();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error.");
    } finally {
      setSendLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Send Money</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Transfer from your Muungano wallet to mobile money or bank
          destinations.
        </p>
      </div>

      {success ? (
        <Card className="border-green-500/40 bg-green-500/5">
          <CardContent className="p-5 text-sm text-green-700 dark:text-green-400">
            {success}
            {refreshing ? " Updating balances…" : ""}
          </CardContent>
        </Card>
      ) : null}

      {!quote ? (
        <Card className="border-border/70 bg-card/95">
          <CardContent className="p-5">
            <form
              onSubmit={(e) => void handleGetQuote(e)}
              className="space-y-4"
            >
              <div className="grid gap-2">
                <Label>Source wallet</Label>
                <select
                  value={sourceWalletId}
                  onChange={(e) => setSourceWalletId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.currency} —{" "}
                      {formatAmount(wallet.balance, wallet.currency)}
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
                  min="0.01"
                  step="0.01"
                  value={amountMajor}
                  onChange={(e) => setAmountMajor(e.target.value)}
                  placeholder="100.00"
                  required
                />
              </div>

              {/* ── Recipient type ── */}
              <div className="grid gap-2">
                <Label>Send via</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        value: "mobile_money",
                        label: "Mobile Money",
                        icon: "📱",
                        sub: "M-Pesa, Airtel, etc.",
                      },
                      {
                        value: "bank",
                        label: "Bank Transfer",
                        icon: "🏦",
                        sub: "NCBA, EcoBank, etc.",
                      },
                    ] as const
                  ).map(({ value, label, icon, sub }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRecipientType(value)}
                      className={cn(
                        "flex flex-col items-start gap-0.5 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                        recipientType === value
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border bg-card hover:bg-accent/40",
                      )}
                    >
                      <span className="text-lg leading-none">{icon}</span>
                      <span className="mt-1.5 font-medium">{label}</span>
                      <span className="text-xs text-muted-foreground">
                        {sub}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Recipient mode ── */}
              <div className="grid gap-2">
                <Label>Recipient</Label>
                <div className="flex rounded-lg border border-border overflow-hidden">
                  {(
                    [
                      { value: "manual", label: "New recipient" },
                      { value: "linked_account", label: "Linked account" },
                    ] as const
                  ).map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRecipientMode(value)}
                      className={cn(
                        "flex-1 py-2 text-sm font-medium transition-colors",
                        recipientMode === value
                          ? "bg-primary text-primary-foreground"
                          : "bg-transparent text-muted-foreground hover:bg-accent/50",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Recipient details ── */}
              {recipientMode === "manual" ? (
                recipientType === "bank" ? (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="bank-name">Bank name</Label>
                      <Input
                        id="bank-name"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="NCBA Kenya"
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="account-name">Account name</Label>
                      <Input
                        id="account-name"
                        value={accountName}
                        onChange={(e) => setAccountName(e.target.value)}
                        placeholder="Jane Doe"
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="account-number">Account number</Label>
                      <Input
                        id="account-number"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder="011000112233"
                        required
                      />
                    </div>
                  </>
                ) : (
                  <div className="grid gap-2">
                    <Label htmlFor="recipient-number">
                      {recipientType === "mobile_money"
                        ? "Phone number"
                        : "Recipient account"}
                    </Label>
                    <Input
                      id="recipient-number"
                      value={recipientNumberOrAccount}
                      onChange={(e) =>
                        setRecipientNumberOrAccount(e.target.value)
                      }
                      placeholder="+254700111222"
                      required
                    />
                  </div>
                )
              ) : linkedCandidates.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                  No linked{" "}
                  {recipientType === "mobile_money" ? "mobile money" : "bank"}{" "}
                  accounts for {sourceWallet?.currency ?? "this wallet"}.
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label>Select linked account</Label>
                  <div className="grid gap-2">
                    {linkedCandidates.map((account) => (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => setLinkedFundingAccountId(account.id)}
                        className={cn(
                          "flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors text-left",
                          linkedFundingAccountId === account.id
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border bg-card hover:bg-accent/40",
                        )}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">
                            {account.providerName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {account.accountIdentifier}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-xs font-medium tabular-nums">
                            {account.currency}{" "}
                            {(account.currentBalance / 100).toLocaleString(
                              undefined,
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            )}
                          </span>
                          {linkedFundingAccountId === account.id && (
                            <span className="text-xs text-primary font-medium">
                              Selected ✓
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" disabled={quoteLoading} className="w-full">
                {quoteLoading ? "Generating quote…" : "Get expiring quote"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/70 bg-card/95">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Review quote</h2>
              <span className="text-xs text-muted-foreground">
                Expires in {expiresIn ?? 0}s
              </span>
            </div>

            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={
                    isQuoteExpiringSoon
                      ? "h-full bg-destructive"
                      : "h-full bg-primary"
                  }
                  style={{ width: `${quoteTimeProgress}%` }}
                />
              </div>
              {isQuoteExpiringSoon ? (
                <p className="text-xs text-destructive">
                  Less than {QUOTE_MIN_SEND_WINDOW_SECONDS}s left. Regenerate
                  quote before sending.
                </p>
              ) : null}
            </div>

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
                  {formatAmount(quote.fees.total, quote.sourceCurrency)}
                </span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Recipient receives
                </span>
                <span className="font-semibold tabular-nums">
                  {formatAmount(
                    quote.destinationAmount,
                    quote.destinationCurrency,
                  )}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Rate</span>
                <span>{quote.exchangeRate}</span>
              </div>
            </div>

            {recipientSummary ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Recipient
                </p>
                {Object.entries(recipientSummary).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3">
                    <span className="text-muted-foreground capitalize">
                      {key
                        .replace(/([A-Z])/g, " $1")
                        .replace(/_/g, " ")
                        .trim()}
                    </span>
                    <span className="font-medium text-right break-all">
                      {String(value)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="pin">Authorize with PIN</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="••••••"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button
                onClick={() => void handleSend()}
                disabled={sendLoading || pin.length < 6 || isQuoteExpiringSoon}
                className="flex-1"
              >
                {sendLoading ? "Sending…" : "Confirm & send"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setQuote(null);
                  setRecipientSummary(null);
                  setError(null);
                }}
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
