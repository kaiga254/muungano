"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import EmployeeForm, { type EmployeeFormValues } from "@/components/EmployeeForm";
import type { Employee } from "@/services/employeeService";

export default function EmployeesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/employees");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = (await res.json()) as { employees?: Employee[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load employees.");
      setEmployees(data.employees ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void fetchEmployees();
  }, [fetchEmployees]);

  const handleCreate = async (values: EmployeeFormValues) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json()) as { employee?: Employee; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create employee.");
      setShowForm(false);
      await fetchEmployees();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create employee.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Employees</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Onboard and manage your payroll workforce.
          </p>
        </div>
        <Button onClick={() => { setFormError(null); setShowForm(true); }}>
          + Add employee
        </Button>
      </div>

      {error ? (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Team roster</CardTitle>
          <CardDescription>
            {loading ? "Loading…" : `${employees.length} employee${employees.length !== 1 ? "s" : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading employees…</p>
          ) : !employees.length ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">No employees yet.</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => { setFormError(null); setShowForm(true); }}
              >
                Onboard your first employee
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Department</TableHead>
                  <TableHead className="hidden sm:table-cell">Country</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell>
                      <div className="font-medium">{emp.fullName}</div>
                      {emp.employeeNumber ? (
                        <div className="text-xs text-muted-foreground">
                          {emp.employeeNumber}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {emp.department ?? "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline">{emp.country}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {emp.salaryCurrency}{" "}
                        {emp.salaryAmount.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell capitalize text-muted-foreground">
                      {emp.employmentType.replace("_", " ")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={emp.isActive ? "success" : "secondary"}>
                        {emp.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/employees/${emp.id}`}>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New employee form dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Onboard new employee</DialogTitle>
            <DialogDescription>
              Enter the employee&apos;s details. Fields marked * are required.
            </DialogDescription>
          </DialogHeader>
          {formError ? (
            <p className="text-sm text-destructive">{formError}</p>
          ) : null}
          <EmployeeForm
            onSubmit={handleCreate}
            submitLabel="Add employee"
            isLoading={submitting}
          />
        </DialogContent>
      </Dialog>
    </main>
  );
}
