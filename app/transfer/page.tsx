"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

// ─── Types ────────────────────────────────────────────────────

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
  sourceAmount: number;
  destinationAmount: number;
  exchangeRate: number;
  fees: { connector: number; muungano: number; total: number };
  expiresAt: string;
  status: string;
};

type Transfer = {
  id: string;
  sourceAmount: number;
  destAmount: number;
  fxRate: number;
  status: string;
  createdAt: string;
};

type Stage =
  | "initiate"
  | "fetching_quote"
  | "review_quote"
  | "authorizing"
  | "processing"
  | "success"
  | "error";

// ─── Constants ────────────────────────────────────────────────

const CURRENCY_FLAGS: Record<string, string> = {
  KES: "🇰🇪",
  MWK: "🇲🇼",
  USD: "🇺🇸",
};

// ─── Helpers ─────────────────────────────────────────────────

function formatMinor(amount: number, currency: string): string {
  const num = amount / 100;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatBalanceStr(balance: string, currency: string): string {
  return formatMinor(Number(balance), currency);
}

function secondsUntil(iso: string): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
}

function fmtSecs(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// ─── Component ────────────────────────────────────────────────

export default function TransferPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Wallets ──────────────────────────────────────────────
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loadingWallets, setLoadingWallets] = useState(true);

  // ── Form ─────────────────────────────────────────────────
  const [sourceWalletId, setSourceWalletId] = useState<string>("");
  const [destWalletId, setDestWalletId] = useState<string>("");
  const [amountInput, setAmountInput] = useState<string>("");

  // ── Flow ─────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>("initiate");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [pin, setPin] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [quoteSecsLeft, setQuoteSecsLeft] = useState<number>(0);
  const [updatedWallets, setUpdatedWallets] = useState<Wallet[]>([]);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load wallets ─────────────────────────────────────────
  const loadWallets = useCallback(async () => {
    try {
      const res = await fetch("/api/wallets");
      if (res.status === 401) { router.push("/login"); return; }
      const data = (await res.json()) as { wallets?: Wallet[] };
      const list = data.wallets ?? [];
      setWallets(list);
      return list;
    } catch {
      return [] as Wallet[];
    } finally {
      setLoadingWallets(false);
    }
  }, [router]);

  useEffect(() => {
    void loadWallets().then((list) => {
      if (!list) return;
      // Pre-select source wallet from ?from= or ?walletId= query param
      const fromId = searchParams.get("from") ?? searchParams.get("walletId");
      const fromCurrency = searchParams.get("currency");

      let src = fromId
        ? list.find((w) => w.id === fromId)
        : fromCurrency
        ? list.find((w) => w.currency === fromCurrency)
        : undefined;

      if (!src) src = list[0];
      if (src) setSourceWalletId(src.id);
    });
  }, [loadWallets, searchParams]);

  // Auto-select destination as the first wallet that isn't the source
  useEffect(() => {
    if (!destWalletId || destWalletId === sourceWalletId) {
      const other = wallets.find((w) => w.id !== sourceWalletId);
      if (other) setDestWalletId(other.id);
    }
  }, [sourceWalletId, wallets, destWalletId]);

  // ── Quote countdown timer ────────────────────────────────
  const startCountdown = useCallback((expiresAt: string) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setQuoteSecsLeft(secondsUntil(expiresAt));
    countdownRef.current = setInterval(() => {
      const remaining = secondsUntil(expiresAt);
      setQuoteSecsLeft(remaining);
      if (remaining === 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        // Quote expired — drop back to initiate so user can refresh
        setStage((s) => {
          if (s === "review_quote") {
            setErrorMsg("Quote expired. Please request a new one.");
            return "initiate";
          }
          return s;
        });
      }
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // ── Step 1 → 2: Request quote ────────────────────────────
  const handleRequestQuote = async () => {
    setErrorMsg("");
    const amount = parseFloat(amountInput);
    if (!amount || amount <= 0) {
      setErrorMsg("Enter a valid amount.");
      return;
    }
    if (!sourceWalletId || !destWalletId) {
      setErrorMsg("Select source and destination wallets.");
      return;
    }
    if (sourceWalletId === destWalletId) {
      setErrorMsg("Source and destination must be different wallets.");
      return;
    }

    setStage("fetching_quote");
    try {
      const res = await fetch("/api/quotes/internal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceWalletId, destWalletId, sourceAmount: amount }),
      });
      const data = (await res.json()) as { quote?: Quote; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to get quote.");
      setQuote(data.quote!);
      startCountdown(data.quote!.expiresAt);
      setStage("review_quote");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not fetch quote.");
      setStage("initiate");
    }
  };

  // ── Step 3 → 4: Move to PIN entry ───────────────────────
  const handleApproveQuote = () => {
    setPin("");
    setErrorMsg("");
    setStage("authorizing");
    setTimeout(() => pinInputRef.current?.focus(), 100);
  };

  // ── Step 4 → 5 → 6: Execute transfer ───────────────────
  const handleExecute = async () => {
    if (pin.length !== 6) {
      setErrorMsg("Please enter your 6-digit PIN.");
      return;
    }
    if (!quote) return;

    setErrorMsg("");
    setStage("processing");
    if (countdownRef.current) clearInterval(countdownRef.current);

    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: quote.id,
          sourceWalletId,
          destWalletId,
          pin,
        }),
      });
      const data = (await res.json()) as { transfer?: Transfer; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Transfer failed.");

      setTransfer(data.transfer!);

      // Refresh wallets to show updated balances
      const fresh = await loadWallets();
      if (fresh) setUpdatedWallets(fresh);

      setStage("success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transfer failed.";
      // If PIN wrong, go back to PIN step; if quote expired, reset flow
      if (msg.toLowerCase().includes("pin")) {
        setErrorMsg(msg);
        setStage("authorizing");
      } else if (msg.toLowerCase().includes("quote")) {
        setErrorMsg(msg + " Please start again.");
        setStage("initiate");
      } else {
        setErrorMsg(msg);
        setStage("error");
      }
    }
  };

  // ─── Derived values ───────────────────────────────────────
  const sourceWallet = wallets.find((w) => w.id === sourceWalletId);
  const destWallet = wallets.find((w) => w.id === destWalletId);
  const availableDest = wallets.filter((w) => w.id !== sourceWalletId);
  const sourceAmountMinor = quote ? quote.sourceAmount : 0;
  const destAmountMinor = quote ? quote.destinationAmount : 0;

  // After success, look up refreshed balances
  const freshSource = updatedWallets.find((w) => w.id === sourceWalletId);
  const freshDest = updatedWallets.find((w) => w.id === destWalletId);

  // ─── Render ───────────────────────────────────────────────

  if (loadingWallets) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-10">
        <div className="text-sm text-muted-foreground">Loading wallets…</div>
      </main>
    );
  }

  if (wallets.length < 2) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-10 space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Transfer Between Wallets</h1>
        <p className="text-sm text-muted-foreground">
          You need at least two wallets to perform an internal transfer.{" "}
          <button
            className="underline text-primary"
            onClick={() => router.push("/wallets")}
          >
            Go to Wallets
          </button>{" "}
          to open another wallet.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Transfer Between Wallets
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Convert and move funds across your Muungano wallets instantly.
        </p>
      </div>

      {/* ── Stage: INITIATE ──────────────────────────────────── */}
      {stage === "initiate" && (
        <Card className="border-border/70 bg-card/95">
          <CardContent className="p-6 space-y-5">
            {/* Source wallet */}
            <div className="grid gap-1.5">
              <Label htmlFor="source">From wallet</Label>
              <select
                id="source"
                title="From wallet"
                value={sourceWalletId}
                onChange={(e) => setSourceWalletId(e.target.value)}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {CURRENCY_FLAGS[w.currency] ?? "💰"} {w.currency} — balance:{" "}
                    {formatBalanceStr(w.balance, w.currency)} {w.currency}
                  </option>
                ))}
              </select>
            </div>

            {/* Destination wallet */}
            <div className="grid gap-1.5">
              <Label htmlFor="dest">To wallet</Label>
              <select
                id="dest"
                title="To wallet"
                value={destWalletId}
                onChange={(e) => setDestWalletId(e.target.value)}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {availableDest.map((w) => (
                  <option key={w.id} value={w.id}>
                    {CURRENCY_FLAGS[w.currency] ?? "💰"} {w.currency} — balance:{" "}
                    {formatBalanceStr(w.balance, w.currency)} {w.currency}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div className="grid gap-1.5">
              <Label htmlFor="amount">
                Amount{sourceWallet ? ` (${sourceWallet.currency})` : ""}
              </Label>
              <div className="relative">
                <Input
                  id="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleRequestQuote()}
                  className="pr-16"
                />
                {sourceWallet && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {sourceWallet.currency}
                  </span>
                )}
              </div>
              {sourceWallet && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Available:{" "}
                    <span className="font-medium">
                      {formatBalanceStr(sourceWallet.balance, sourceWallet.currency)}{" "}
                      {sourceWallet.currency}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => {
                      const bal = (Number(sourceWallet.balance) / 100).toFixed(2);
                      setAmountInput(bal);
                    }}
                  >
                    Use max
                  </button>
                </div>
              )}
            </div>

            {errorMsg && (
              <p className="text-sm text-destructive">{errorMsg}</p>
            )}

            <Button
              className="w-full"
              onClick={() => void handleRequestQuote()}
              disabled={!amountInput || !sourceWalletId || !destWalletId}
            >
              Get Quote →
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Stage: FETCHING QUOTE ────────────────────────── */}
      {stage === "fetching_quote" && (
        <Card className="border-border/70 bg-card/95">
          <CardContent className="p-10 flex flex-col items-center gap-4">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">
              Requesting exchange rate from Interledger / Rafiki…
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Stage: REVIEW QUOTE ──────────────────────────── */}
      {stage === "review_quote" && quote && sourceWallet && destWallet && (
        <Card className="border-border/70 bg-card/95">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Review Quote</h2>
              <Badge
                variant={quoteSecsLeft > 30 ? "secondary" : "destructive"}
                className="tabular-nums text-xs"
              >
                ⏱ {fmtSecs(quoteSecsLeft)}
              </Badge>
            </div>

            {/* Transfer flow — fees deducted from source before conversion */}
            <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
              {/* Step 1: full debit */}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">You send</span>
                <span className="font-semibold tabular-nums">
                  {CURRENCY_FLAGS[quote.sourceCurrency]}{" "}
                  {formatMinor(sourceAmountMinor, quote.sourceCurrency)}{" "}
                  {quote.sourceCurrency}
                </span>
              </div>

              {/* Step 2: fees deducted from source */}
              <div className="rounded-md border border-border/40 bg-background/60 px-3 py-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Muungano fee (0.7%)</span>
                  <span className="tabular-nums text-destructive">
                    {"−"}{formatMinor(quote.fees.muungano, quote.sourceCurrency)}{" "}
                    {quote.sourceCurrency}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Connector fee (fixed)</span>
                  <span className="tabular-nums text-destructive">
                    {"−"}{formatMinor(quote.fees.connector, quote.sourceCurrency)}{" "}
                    {quote.sourceCurrency}
                  </span>
                </div>
                <div className="flex justify-between text-xs font-medium border-t border-border/40 pt-1 mt-1">
                  <span>Total fees</span>
                  <span className="tabular-nums text-destructive">
                    {"−"}{formatMinor(quote.fees.total, quote.sourceCurrency)}{" "}
                    {quote.sourceCurrency}
                  </span>
                </div>
              </div>

              {/* Step 3: net amount that gets converted */}
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Net amount converted</span>
                <span className="tabular-nums">
                  {formatMinor(sourceAmountMinor - quote.fees.total, quote.sourceCurrency)}{" "}
                  {quote.sourceCurrency}
                </span>
              </div>

              {/* Rate line */}
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Rate</span>
                <span className="tabular-nums">
                  1 {quote.sourceCurrency}{" = "}
                  {Number(quote.exchangeRate).toLocaleString(undefined, {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 6,
                  })}{" "}
                  {quote.destinationCurrency}
                </span>
              </div>

              <div className="flex items-center justify-center text-muted-foreground pt-1">↓</div>

              {/* Step 4: destination credit */}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">You receive</span>
                <span className="font-bold tabular-nums text-green-600">
                  {CURRENCY_FLAGS[quote.destinationCurrency]}{" "}
                  {formatMinor(destAmountMinor, quote.destinationCurrency)}{" "}
                  {quote.destinationCurrency}
                </span>
              </div>
            </div>

            {/* Source / dest wallet info */}
            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
              <div className="rounded-md border border-border/50 p-3">
                <div className="font-medium text-foreground mb-1">
                  {CURRENCY_FLAGS[sourceWallet.currency]} {sourceWallet.currency} wallet
                </div>
                <div>
                  Balance after:{" "}
                  <span className="tabular-nums font-medium text-foreground">
                    {formatMinor(
                      Number(sourceWallet.balance) - sourceAmountMinor,
                      sourceWallet.currency,
                    )}{" "}
                    {sourceWallet.currency}
                  </span>
                </div>
              </div>
              <div className="rounded-md border border-border/50 p-3">
                <div className="font-medium text-foreground mb-1">
                  {CURRENCY_FLAGS[destWallet.currency]} {destWallet.currency} wallet
                </div>
                <div>
                  Balance after:{" "}
                  <span className="tabular-nums font-medium text-green-600">
                    {formatMinor(
                      Number(destWallet.balance) + destAmountMinor,
                      destWallet.currency,
                    )}{" "}
                    {destWallet.currency}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  if (countdownRef.current) clearInterval(countdownRef.current);
                  setQuote(null);
                  setStage("initiate");
                  setErrorMsg("");
                }}
              >
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleApproveQuote}>
                Confirm &amp; Enter PIN
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Stage: AUTHORIZING (PIN) ──────────────────────── */}
      {stage === "authorizing" && quote && (
        <Card className="border-border/70 bg-card/95">
          <CardContent className="p-6 space-y-5">
            <h2 className="font-semibold">Authorize Transfer</h2>

            {/* Compact summary */}
            <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sending</span>
                <span className="font-semibold tabular-nums">
                  {CURRENCY_FLAGS[quote.sourceCurrency]}{" "}
                  {formatMinor(sourceAmountMinor, quote.sourceCurrency)}{" "}
                  {quote.sourceCurrency}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Fees deducted</span>
                <span className="tabular-nums text-destructive">
                  {"−"}{formatMinor(quote.fees.total, quote.sourceCurrency)}{" "}
                  {quote.sourceCurrency}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border/40 pt-1.5">
                <span className="text-muted-foreground">You receive</span>
                <span className="font-bold tabular-nums text-green-600">
                  {CURRENCY_FLAGS[quote.destinationCurrency]}{" "}
                  {formatMinor(destAmountMinor, quote.destinationCurrency)}{" "}
                  {quote.destinationCurrency}
                </span>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="pin">Enter your 6-digit PIN</Label>
              <Input
                id="pin"
                ref={pinInputRef}
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="• • • • • •"
                value={pin}
                autoComplete="current-password"
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setPin(v);
                  if (v.length === 6) {
                    // Auto-submit on 6th digit
                    setTimeout(() => void handleExecute(), 100);
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && void handleExecute()}
                className="tracking-[0.5em] text-center text-lg"
              />
              <p className="text-xs text-muted-foreground">
                Enter your PIN to authorize the transfer.
              </p>
            </div>

            {errorMsg && (
              <p className="text-sm text-destructive">{errorMsg}</p>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setPin("");
                  setErrorMsg("");
                  setStage("review_quote");
                  startCountdown(quote.expiresAt);
                }}
              >
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={() => void handleExecute()}
                disabled={pin.length !== 6}
              >
                Transfer Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Stage: PROCESSING ────────────────────────────── */}
      {stage === "processing" && quote && (
        <Card className="border-border/70 bg-card/95">
          <CardContent className="p-10 flex flex-col items-center gap-4">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="font-medium">Processing transfer…</p>
            <p className="text-sm text-muted-foreground text-center">
              Routing{" "}
              <span className="font-semibold">
                {formatMinor(sourceAmountMinor, quote.sourceCurrency)}{" "}
                {quote.sourceCurrency}
              </span>{" "}
              via Interledger to your{" "}
              <span className="font-semibold">{quote.destinationCurrency}</span>{" "}
              wallet.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Stage: SUCCESS ───────────────────────────────── */}
      {stage === "success" && transfer && quote && (
        <Card className="border-border/70 bg-card/95">
          <CardContent className="p-6 space-y-5">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="text-5xl">✅</div>
              <h2 className="text-xl font-semibold">Transfer Complete!</h2>
              <p className="text-sm text-muted-foreground">
                Your funds have been successfully converted and deposited.
              </p>
            </div>

            <Separator />

            {/* Transfer details */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount debited</span>
                <span className="tabular-nums font-medium">
                  {formatMinor(transfer.sourceAmount, quote.sourceCurrency)}{" "}
                  {quote.sourceCurrency}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Fees paid</span>
                <span className="tabular-nums text-destructive">
                  {"−"}{formatMinor(quote.fees.total, quote.sourceCurrency)}{" "}
                  {quote.sourceCurrency}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Net converted</span>
                <span className="tabular-nums">
                  {formatMinor(transfer.sourceAmount - quote.fees.total, quote.sourceCurrency)}{" "}
                  {quote.sourceCurrency}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Settled to {quote.destinationCurrency} wallet
                </span>
                <span className="tabular-nums font-semibold text-green-600">
                  {formatMinor(transfer.destAmount, quote.destinationCurrency)}{" "}
                  {quote.destinationCurrency}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Rate used</span>
                <span className="tabular-nums">
                  1 {quote.sourceCurrency}{" = "}
                  {Number(transfer.fxRate).toLocaleString(undefined, {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 6,
                  })}{" "}
                  {quote.destinationCurrency}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Reference</span>
                <span className="font-mono">{transfer.id.split("-")[0]}</span>
              </div>
            </div>

            {/* Updated balances */}
            {(freshSource ?? freshDest) && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Updated balances
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {freshSource && (
                      <div className="rounded-md bg-muted/50 p-3 text-sm">
                        <div className="text-xs text-muted-foreground mb-1">
                          {CURRENCY_FLAGS[freshSource.currency]} {freshSource.currency}
                        </div>
                        <div className="font-semibold tabular-nums">
                          {formatBalanceStr(freshSource.balance, freshSource.currency)}
                        </div>
                      </div>
                    )}
                    {freshDest && (
                      <div className="rounded-md bg-muted/50 p-3 text-sm">
                        <div className="text-xs text-muted-foreground mb-1">
                          {CURRENCY_FLAGS[freshDest.currency]} {freshDest.currency}
                        </div>
                        <div className="font-semibold tabular-nums text-green-600">
                          {formatBalanceStr(freshDest.balance, freshDest.currency)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  // Reset to initiate with same wallets
                  setQuote(null);
                  setTransfer(null);
                  setAmountInput("");
                  setPin("");
                  setErrorMsg("");
                  setUpdatedWallets([]);
                  setStage("initiate");
                }}
              >
                New Transfer
              </Button>
              <Button className="flex-1" onClick={() => router.push("/wallets")}>
                View Wallets
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Stage: ERROR ─────────────────────────────────── */}
      {stage === "error" && (
        <Card className="border-destructive/50 bg-card/95">
          <CardContent className="p-6 space-y-4">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="text-4xl">❌</div>
              <h2 className="font-semibold text-destructive">Transfer Failed</h2>
              <p className="text-sm text-muted-foreground">{errorMsg}</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => router.push("/wallets")}
              >
                Back to Wallets
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setStage("initiate");
                  setErrorMsg("");
                  setQuote(null);
                  setPin("");
                }}
              >
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
