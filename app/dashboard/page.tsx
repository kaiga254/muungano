"use client";

import { useState } from "react";
import PayrollForm, { type PayrollFormValues } from "@/components/PayrollForm";
import SplitDisplay from "@/components/SplitDisplay";
import TransactionLog, {
  type TransactionItem,
} from "@/components/TransactionLog";
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
    <main className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-4 py-8 md:grid-cols-2">
      <div className="grid gap-6">
        <div>
          <h1 className="text-3xl font-bold">Muungano Payroll Dashboard</h1>
          <p className="mt-2 text-sm opacity-85">
            Trigger cross-border payroll from Malawi (MWK) to Kenya (KES) via
            Rafiki + Interledger.
          </p>
        </div>
        <PayrollForm onSubmit={runPayroll} isLoading={loading} />
        {error ? (
          <p className="rounded border border-foreground/30 p-3 text-sm">
            {error}
          </p>
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
