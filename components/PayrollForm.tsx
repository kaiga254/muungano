"use client";

import { FormEvent, useState } from "react";

export type PayrollFormValues = {
  employeeName: string;
  salaryAmount: number;
  destinationPointer: string;
};

type PayrollFormProps = {
  onSubmit: (values: PayrollFormValues) => Promise<void>;
  isLoading: boolean;
};

export default function PayrollForm({ onSubmit, isLoading }: PayrollFormProps) {
  const [employeeName, setEmployeeName] = useState("Amina Mwale");
  const [salaryAmount, setSalaryAmount] = useState(150000);
  const [destinationPointer, setDestinationPointer] = useState(
    "$wallet.kenya.example/amw",
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit({ employeeName, salaryAmount, destinationPointer });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-4 rounded-lg border border-foreground/20 p-5"
    >
      <h2 className="text-xl font-semibold">Run Payroll</h2>

      <label className="grid gap-2 text-sm">
        Employee Name
        <input
          className="rounded border border-foreground/30 bg-background px-3 py-2"
          value={employeeName}
          onChange={(event) => setEmployeeName(event.target.value)}
          required
        />
      </label>

      <label className="grid gap-2 text-sm">
        Salary (MWK)
        <input
          className="rounded border border-foreground/30 bg-background px-3 py-2"
          type="number"
          min={1}
          value={salaryAmount}
          onChange={(event) => setSalaryAmount(Number(event.target.value))}
          required
        />
      </label>

      <label className="grid gap-2 text-sm">
        Destination Wallet Address (Open Payments pointer)
        <input
          className="rounded border border-foreground/30 bg-background px-3 py-2"
          value={destinationPointer}
          onChange={(event) => setDestinationPointer(event.target.value)}
          required
        />
      </label>

      <button
        type="submit"
        disabled={isLoading}
        className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-60"
      >
        {isLoading ? "Running..." : "Run Payroll"}
      </button>
    </form>
  );
}
