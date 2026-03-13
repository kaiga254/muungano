"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import EmployeeForm, {
  type EmployeeFormValues,
} from "@/components/EmployeeForm";
import type { Employee } from "@/services/employeeService";

type PageProps = { params: Promise<{ id: string }> };

export default function EmployeeDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const fetchEmployee = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/employees/${id}`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = (await res.json()) as {
        employee?: Employee;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Employee not found.");
      setEmployee(data.employee ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employee.");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void fetchEmployee();
  }, [fetchEmployee]);

  const handleUpdate = async (values: EmployeeFormValues) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/employees/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json()) as {
        employee?: Employee;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to update employee.");
      setEmployee(data.employee ?? null);
      setEditing(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to update employee.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (
      !confirm(
        "Deactivate this employee? They will no longer appear in payroll runs.",
      )
    )
      return;
    setDeactivating(true);
    try {
      const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to deactivate employee.");
      }
      router.push("/employees");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate.");
      setDeactivating(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (error || !employee) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-destructive">{error ?? "Employee not found."}</p>
        <Link href="/employees">
          <Button variant="outline" className="mt-4">
            Back to employees
          </Button>
        </Link>
      </main>
    );
  }

  const infoRow = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="grid gap-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm font-medium">{value}</dd>
      </div>
    ) : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {employee.fullName}
            </h1>
            <Badge variant={employee.isActive ? "success" : "secondary"}>
              {employee.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          {employee.jobTitle || employee.department ? (
            <p className="text-muted-foreground text-sm">
              {[employee.jobTitle, employee.department]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/employees">
            <Button variant="ghost" size="sm">
              ← Employees
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFormError(null);
              setEditing(true);
            }}
          >
            Edit
          </Button>
          {employee.isActive ? (
            <Button
              variant="outline"
              size="sm"
              disabled={deactivating}
              onClick={() => void handleDeactivate()}
              className="text-destructive border-destructive/50 hover:bg-destructive/10"
            >
              {deactivating ? "Deactivating…" : "Deactivate"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Identity</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              {infoRow("Employee no.", employee.employeeNumber)}
              {infoRow("Email", employee.email)}
              {infoRow("Phone", employee.phone)}
              {infoRow("Country", employee.country)}
              {infoRow("Start date", employee.startDate)}
            </dl>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Salary & payout</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              {infoRow(
                "Monthly salary",
                `${employee.salaryCurrency} ${employee.salaryAmount.toLocaleString()}`,
              )}
              {infoRow("Destination pointer", employee.destinationPointer)}
              {infoRow(
                "Employment type",
                employee.employmentType.replace("_", " "),
              )}
            </dl>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Statutory identifiers</CardTitle>
            <CardDescription>
              {employee.country === "KE" ? "Kenya" : "Malawi / multi-country"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              {infoRow("National ID", employee.nationalId)}
              {infoRow("KRA PIN", employee.kraPin)}
              {infoRow("NHIF No.", employee.nhifNumber)}
              {infoRow("NSSF No.", employee.nssfNumber)}
              {infoRow("TPIN", employee.tpin)}
            </dl>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Salary split rules</CardTitle>
            <CardDescription>
              Applied on each payroll run for this employee.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {employee.splitRules.map((rule) => (
                <li
                  key={rule.key}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm"
                >
                  <span>{rule.label}</span>
                  <Badge variant="outline">{rule.percentage}%</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Edit dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit employee</DialogTitle>
            <DialogDescription>
              Update {employee.fullName}&apos;s profile.
            </DialogDescription>
          </DialogHeader>
          {formError ? (
            <p className="text-sm text-destructive">{formError}</p>
          ) : null}
          <EmployeeForm
            initial={employee}
            onSubmit={handleUpdate}
            submitLabel="Save changes"
            isLoading={submitting}
          />
        </DialogContent>
      </Dialog>
    </main>
  );
}
