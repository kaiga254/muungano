"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Rail = "mpesa" | "bank";

type SimulatorAccount = {
  id: string;
  providerName: string;
  accountName: string;
  accountRef: string;
  currency: string;
  currentBalance: number;
  country: string;
  updatedAt: string;
};

type SimulatorTransaction = {
  id: string;
  direction: "credit" | "debit";
  amount: number;
  currency: string;
  reference: string;
  narration: string | null;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
};

const railLabels: Record<Rail, string> = {
  mpesa: "M-Pesa Simulator",
  bank: "Bank Simulator",
};

const rails: Rail[] = ["mpesa", "bank"];

const simulatorApiBasePath =
  process.env.NEXT_PUBLIC_SIMULATOR_API_BASE_PATH ?? "/api/simulators";

const money = (amount: number, currency: string) =>
  `${currency} ${(amount / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function RailSimulatorPage() {
  const params = useParams<{ rail: string }>();
  const router = useRouter();
  const rail = params.rail as Rail;

  const [accounts, setAccounts] = useState<SimulatorAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [transactions, setTransactions] = useState<SimulatorTransaction[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("1000");
  const [narration, setNarration] = useState("");

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );

  useEffect(() => {
    if (!rails.includes(rail)) {
      router.push("/simulators");
    }
  }, [rail, router]);

  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    setError(null);
    try {
      const response = await fetch(`${simulatorApiBasePath}/${rail}/accounts`);
      if (response.status === 401) {
        router.push("/login");
        return;
      }

      const payload = (await response.json()) as {
        accounts?: SimulatorAccount[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load simulator accounts.");
      }

      const nextAccounts = payload.accounts ?? [];
      setAccounts(nextAccounts);
      if (!selectedAccountId && nextAccounts.length > 0) {
        setSelectedAccountId(nextAccounts[0].id);
      }
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load accounts.",
      );
    } finally {
      setLoadingAccounts(false);
    }
  };

  const fetchTransactions = async (accountId: string) => {
    setLoadingTransactions(true);
    setError(null);
    try {
      const response = await fetch(
        `${simulatorApiBasePath}/${rail}/accounts/${accountId}/transactions?limit=50`,
      );
      const payload = (await response.json()) as {
        transactions?: SimulatorTransaction[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load transactions.");
      }

      setTransactions(payload.transactions ?? []);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load transactions.",
      );
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    void fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rail]);

  useEffect(() => {
    if (selectedAccountId) {
      void fetchTransactions(selectedAccountId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, rail]);

  const postTransaction = async () => {
    if (!selectedAccount) {
      setError("Select an account first.");
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${simulatorApiBasePath}/${rail}/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccount.id,
          direction,
          amount: Math.round(parsedAmount * 100),
          currency: selectedAccount.currency,
          narration: narration || `${direction.toUpperCase()} ${rail} account`,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          payload.error ?? "Failed to post simulator transaction.",
        );
      }

      setAmount("1000");
      setNarration("");
      await fetchAccounts();
      await fetchTransactions(selectedAccountId);
    } catch (postError) {
      setError(
        postError instanceof Error
          ? postError.message
          : "Failed to post transaction.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="grid content-start gap-6">
        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>{railLabels[rail] ?? "Simulator"}</span>
              <Badge variant="secondary">Neon-backed</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {rails.map((entry) => (
                <Link key={entry} href={`/simulators/${entry}`}>
                  <Button
                    variant={rail === entry ? "secondary" : "outline"}
                    size="sm"
                  >
                    {railLabels[entry].replace(" Simulator", "")}
                  </Button>
                </Link>
              ))}
            </div>
            <Link href="/simulators">
              <Button variant="ghost" size="sm">
                ← Back to simulator hub
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle>Funding accounts</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAccounts ? (
              <p className="text-sm text-muted-foreground">Loading accounts…</p>
            ) : accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No accounts available for this rail yet.
              </p>
            ) : (
              <ul className="grid gap-2">
                {accounts.map((account) => (
                  <li key={account.id}>
                    <Button
                      variant={
                        selectedAccountId === account.id
                          ? "secondary"
                          : "outline"
                      }
                      className="h-auto w-full justify-between py-3"
                      onClick={() => setSelectedAccountId(account.id)}
                    >
                      <div className="text-left">
                        <div className="font-medium">
                          {account.providerName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {account.accountName} · {account.accountRef}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-semibold">
                          {money(account.currentBalance, account.currency)}
                        </div>
                      </div>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid content-start gap-6">
        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle>Post transaction</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {selectedAccount ? (
              <>
                <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
                  <strong>{selectedAccount.providerName}</strong> ·{" "}
                  {money(
                    selectedAccount.currentBalance,
                    selectedAccount.currency,
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>Direction</Label>
                    <select
                      value={direction}
                      onChange={(event) =>
                        setDirection(event.target.value as "credit" | "debit")
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    >
                      <option value="credit">Credit</option>
                      <option value="debit">Debit</option>
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Amount ({selectedAccount.currency})</Label>
                    <Input
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2 sm:col-span-3">
                    <Label>Narration</Label>
                    <Input
                      value={narration}
                      onChange={(event) => setNarration(event.target.value)}
                    />
                  </div>
                </div>
                <Button
                  onClick={() => void postTransaction()}
                  disabled={submitting}
                >
                  {submitting ? "Posting…" : "Post transaction"}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a funding account first.
              </p>
            )}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingTransactions ? (
              <p className="text-sm text-muted-foreground">
                Loading transactions…
              </p>
            ) : transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No transactions for this account yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Balance After</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>
                        <Badge
                          variant={
                            transaction.direction === "credit"
                              ? "success"
                              : "outline"
                          }
                        >
                          {transaction.direction.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {money(transaction.amount, transaction.currency)}
                      </TableCell>
                      <TableCell>
                        {money(transaction.balanceAfter, transaction.currency)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {transaction.reference}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(transaction.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
