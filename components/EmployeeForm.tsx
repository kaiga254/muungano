"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Employee } from "@/services/employeeService";
import type { SplitRule } from "@/services/payrollService";
import { DEFAULT_SPLIT_RULES } from "@/services/payrollService";

export type EmployeeFormValues = {
  employeeNumber: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  jobTitle: string;
  employmentType: string;
  country: string;
  salaryAmount: number;
  salaryCurrency: string;
  destinationPointer: string;
  nationalId: string;
  kraPin: string;
  nhifNumber: string;
  nssfNumber: string;
  tpin: string;
  startDate: string;
  splitRules: SplitRule[];
};

type EmployeeFormProps = {
  initial?: Partial<Employee>;
  onSubmit: (values: EmployeeFormValues) => Promise<void>;
  submitLabel?: string;
  isLoading?: boolean;
};

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
];

const SALARY_CURRENCIES = [
  { value: "MWK", label: "MWK – Malawian Kwacha" },
  { value: "KES", label: "KES – Kenyan Shilling" },
  { value: "USD", label: "USD – US Dollar" },
];

const COUNTRIES = [
  { value: "KE", label: "Kenya" },
  { value: "MW", label: "Malawi" },
];

const fieldClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export default function EmployeeForm({
  initial,
  onSubmit,
  submitLabel = "Save employee",
  isLoading = false,
}: EmployeeFormProps) {
  const [employeeNumber, setEmployeeNumber] = useState(
    initial?.employeeNumber ?? "",
  );
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? "");
  const [employmentType, setEmploymentType] = useState(
    initial?.employmentType ?? "full_time",
  );
  const [country, setCountry] = useState(initial?.country ?? "KE");
  const [salaryAmount, setSalaryAmount] = useState(initial?.salaryAmount ?? 0);
  const [salaryCurrency, setSalaryCurrency] = useState(
    initial?.salaryCurrency ?? "MWK",
  );
  const [destinationPointer, setDestinationPointer] = useState(
    initial?.destinationPointer ?? "",
  );
  const [nationalId, setNationalId] = useState(initial?.nationalId ?? "");
  const [kraPin, setKraPin] = useState(initial?.kraPin ?? "");
  const [nhifNumber, setNhifNumber] = useState(initial?.nhifNumber ?? "");
  const [nssfNumber, setNssfNumber] = useState(initial?.nssfNumber ?? "");
  const [tpin, setTpin] = useState(initial?.tpin ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [splitRules, setSplitRules] = useState<SplitRule[]>(
    initial?.splitRules ?? DEFAULT_SPLIT_RULES.map((r) => ({ ...r })),
  );
  const [splitError, setSplitError] = useState<string | null>(null);

  const splitTotal = splitRules.reduce((sum, r) => sum + r.percentage, 0);

  const updateSplitPercentage = (key: string, value: number) => {
    setSplitRules((prev) =>
      prev.map((r) => (r.key === key ? { ...r, percentage: value } : r)),
    );
    setSplitError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (Math.round(splitTotal * 100) !== 10000) {
      setSplitError(
        `Split percentages must total 100%. Current: ${splitTotal.toFixed(2)}%`,
      );
      return;
    }

    await onSubmit({
      employeeNumber,
      fullName,
      email,
      phone,
      department,
      jobTitle,
      employmentType,
      country,
      salaryAmount,
      salaryCurrency,
      destinationPointer,
      nationalId,
      kraPin,
      nhifNumber,
      nssfNumber,
      tpin,
      startDate,
      splitRules,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      {/* Personal details */}
      <section className="grid gap-4">
        <p className="text-sm font-semibold">Personal details</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ef-full-name">Full name *</Label>
            <Input
              id="ef-full-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Wanjiku"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ef-employee-number">Employee number</Label>
            <Input
              id="ef-employee-number"
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              placeholder="EMP-001"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ef-email">Email</Label>
            <Input
              id="ef-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@company.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ef-phone">Phone</Label>
            <Input
              id="ef-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+254 7XX XXX XXX"
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* Job details */}
      <section className="grid gap-4">
        <p className="text-sm font-semibold">Job details</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ef-department">Department</Label>
            <Input
              id="ef-department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Engineering"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ef-job-title">Job title</Label>
            <Input
              id="ef-job-title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Software Engineer"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ef-employment-type">Employment type</Label>
            <select
              id="ef-employment-type"
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              className={fieldClass}
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ef-country">Country</Label>
            <select
              id="ef-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={fieldClass}
            >
              {COUNTRIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ef-start-date">Start date</Label>
            <Input
              id="ef-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* Salary and payout */}
      <section className="grid gap-4">
        <p className="text-sm font-semibold">Salary & payout</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ef-salary">Monthly salary *</Label>
            <Input
              id="ef-salary"
              type="number"
              min={1}
              required
              value={salaryAmount || ""}
              onChange={(e) => setSalaryAmount(Number(e.target.value))}
              placeholder="150000"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ef-currency">Salary currency</Label>
            <select
              id="ef-currency"
              value={salaryCurrency}
              onChange={(e) => setSalaryCurrency(e.target.value)}
              className={fieldClass}
            >
              {SALARY_CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="ef-destination">
              Destination wallet / Open Payments pointer *
            </Label>
            <Input
              id="ef-destination"
              required
              value={destinationPointer}
              onChange={(e) => setDestinationPointer(e.target.value)}
              placeholder="$wallet.kenya.example/jane"
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* Statutory identifiers */}
      <section className="grid gap-4">
        <p className="text-sm font-semibold">Statutory identifiers</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ef-national-id">National ID</Label>
            <Input
              id="ef-national-id"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ef-kra-pin">KRA PIN (Kenya)</Label>
            <Input
              id="ef-kra-pin"
              value={kraPin}
              onChange={(e) => setKraPin(e.target.value)}
              placeholder="A000000000A"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ef-nhif">NHIF No. (Kenya)</Label>
            <Input
              id="ef-nhif"
              value={nhifNumber}
              onChange={(e) => setNhifNumber(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ef-nssf">NSSF No. (Kenya / Malawi)</Label>
            <Input
              id="ef-nssf"
              value={nssfNumber}
              onChange={(e) => setNssfNumber(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ef-tpin">TPIN (Malawi)</Label>
            <Input
              id="ef-tpin"
              value={tpin}
              onChange={(e) => setTpin(e.target.value)}
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* Split rules */}
      <section className="grid gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Salary split rules</p>
          <span
            className={`text-xs font-medium ${
              Math.round(splitTotal * 100) === 10000
                ? "text-green-600"
                : "text-destructive"
            }`}
          >
            Total: {splitTotal.toFixed(2)}%
          </span>
        </div>
        <div className="grid gap-3">
          {splitRules.map((rule) => (
            <div key={rule.key} className="flex items-center gap-3">
              <span className="min-w-[160px] text-sm">{rule.label}</span>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={rule.percentage}
                onChange={(e) =>
                  updateSplitPercentage(rule.key, Number(e.target.value))
                }
                className="max-w-[100px]"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          ))}
        </div>
        {splitError ? (
          <p className="text-sm text-destructive">{splitError}</p>
        ) : null}
      </section>

      <div className="flex gap-3">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
