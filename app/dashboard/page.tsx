"use client";

import Link from "next/link";
import { useState } from "react";
import PayrollForm, { type PayrollFormValues } from "@/components/PayrollForm";
import SplitDisplay from "@/components/SplitDisplay";
import TransactionLog, {
  type TransactionItem,
} from "@/components/TransactionLog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SalarySplit } from "@/services/payrollService";

type RunPayrollResponse = {
  payrollRun: TransactionItem & {
    splits: SalarySplit[];
  };
  error?: string;
  details?: string;
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestSplits, setLatestSplits] = useState<SalarySplit[]>([]);
  const [latestTotal, setLatestTotal] = useState<number>(0);
  const [logs, setLogs] = useState<TransactionItem[]>([]);

  const runPayroll = async (values: PayrollFormValues) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/payroll/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const payload = (await response.json()) as RunPayrollResponse;
      if (!response.ok || !payload.payrollRun) {
        throw new Error(
          payload.details || payload.error || "Payroll execution failed",
        );
      }

      setLatestSplits(payload.payrollRun.splits);
      setLatestTotal(payload.payrollRun.destinationAmount);
      setLogs((previous) => [payload.payrollRun, ...previous].slice(0, 10));
    } catch (runError) {
      setError(
        runError instanceof Error ? runError.message : "Unable to run payroll",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-7xl gap-6 px-4 py-8 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="grid content-start gap-6">
        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardContent className="space-y-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
                  Payroll Orchestration
                </Badge>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">
                    Muungano Payroll Dashboard
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    Trigger cross-border payroll from Malawi (MWK) to Kenya (KES)
                    through Rafiki, then route settled funds to downstream obligations.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/simulators">
                  <Button variant="outline">Open Simulator Console</Button>
                </Link>
                <Link href="/">
                  <Button variant="ghost">Home</Button>
                </Link>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
                <div className="text-sm text-muted-foreground">Latest settlement</div>
                <div className="mt-1 text-2xl font-semibold">
                  KES {latestTotal.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
                <div className="text-sm text-muted-foreground">Recent payroll runs</div>
                <div className="mt-1 text-2xl font-semibold">{logs.length}</div>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
                <div className="text-sm text-muted-foreground">Split routes</div>
                <div className="mt-1 text-2xl font-semibold">{latestSplits.length}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <PayrollForm onSubmit={runPayroll} isLoading={loading} />

        {error ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-4 text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="grid content-start gap-6">
        <SplitDisplay
          splits={latestSplits}
          total={latestTotal}
          currency="KES"
        />
        <TransactionLog logs={logs} />
      </div>
    </main>
  );
}
