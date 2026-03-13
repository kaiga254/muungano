"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SplitDisplay from "@/components/SplitDisplay";
import TransactionLog, {
  type TransactionItem,
} from "@/components/TransactionLog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { SalarySplit } from "@/services/payrollService";
import type { Employee } from "@/services/employeeService";

type RunPayrollResponse = {
  payrollRun: TransactionItem & {
    splits: SalarySplit[];
  };
  error?: string;
  details?: string;
};

async function parseJsonSafely<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [latestSplits, setLatestSplits] = useState<SalarySplit[]>([]);
  const [latestTotal, setLatestTotal] = useState<number>(0);
  const [logs, setLogs] = useState<TransactionItem[]>([]);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch("/api/employees");
      if (res.status === 401) {
        router.push("/login");
        return;
      }

      const data = await parseJsonSafely<{ employees?: Employee[] }>(res);
      if (!res.ok) {
        return;
      }

      const active = (data?.employees ?? []).filter((e) => e.isActive);
      setEmployees(active);
      if (active.length > 0) {
        setSelectedEmployeeId(active[0].id);
      }
    } catch {
      // non-critical
    }
  }, [router]);

  useEffect(() => {
    void fetchEmployees();
  }, [fetchEmployees]);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  const runPayroll = async () => {
    if (!selectedEmployeeId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/payroll/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: selectedEmployeeId }),
      });

      const payload = await parseJsonSafely<RunPayrollResponse>(response);
      if (!payload) {
        throw new Error(
          `Payroll API returned an empty or invalid response (${response.status})`,
        );
      }

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
                <Badge
                  variant="secondary"
                  className="w-fit rounded-full px-3 py-1"
                >
                  Payroll Orchestration
                </Badge>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">
                    Payroll Dashboard
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    Select an employee and run cross-border payroll from Malawi
                    (MWK) to Kenya (KES) through Rafiki, routing settled funds
                    to downstream obligations.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/employees">
                  <Button variant="outline">Manage Employees</Button>
                </Link>
                <Link href="/simulators">
                  <Button variant="outline">Simulators</Button>
                </Link>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
                <div className="text-sm text-muted-foreground">
                  Latest settlement
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  KES {latestTotal.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
                <div className="text-sm text-muted-foreground">
                  Recent payroll runs
                </div>
                <div className="mt-1 text-2xl font-semibold">{logs.length}</div>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
                <div className="text-sm text-muted-foreground">
                  Active employees
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {employees.length}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payroll runner */}
        <Card className="border-border/70 bg-card/95 backdrop-blur-sm">
          <CardContent className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Run Payroll</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Select an onboarded employee to trigger cross-border settlement
                and obligation routing.
              </p>
            </div>

            {employees.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 p-6 text-center">
                <p className="text-muted-foreground text-sm">
                  No active employees found.
                </p>
                <Link href="/employees">
                  <Button variant="outline" className="mt-3">
                    Onboard employees →
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid gap-5">
                <div className="grid gap-2">
                  <Label htmlFor="employee-select">Employee</Label>
                  <select
                    id="employee-select"
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName}
                        {emp.employeeNumber ? ` (${emp.employeeNumber})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedEmployee ? (
                  <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Salary</div>
                      <div className="font-medium">
                        {selectedEmployee.salaryCurrency}{" "}
                        {selectedEmployee.salaryAmount.toLocaleString()} / month
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Destination</div>
                      <div className="font-medium truncate">
                        {selectedEmployee.destinationPointer}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Department</div>
                      <div className="font-medium">
                        {selectedEmployee.department ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Split rules</div>
                      <div className="font-medium">
                        {selectedEmployee.splitRules.length} allocations
                      </div>
                    </div>
                  </div>
                ) : null}

                <Button
                  onClick={() => void runPayroll()}
                  disabled={loading || !selectedEmployeeId}
                  className="w-full sm:w-fit"
                >
                  {loading ? "Running…" : "Run Payroll"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

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
