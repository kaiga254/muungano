"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <Card className="border-border/70 bg-card/95 backdrop-blur-sm">
      <CardHeader>
        <CardTitle>Run Payroll</CardTitle>
        <CardDescription>
          Trigger cross-border settlement and obligation routing in one flow.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="employee-name">Employee Name</Label>
            <Input
              id="employee-name"
              value={employeeName}
              onChange={(event) => setEmployeeName(event.target.value)}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="salary-amount">Salary (MWK)</Label>
            <Input
              id="salary-amount"
              type="number"
              min={1}
              value={salaryAmount}
              onChange={(event) => setSalaryAmount(Number(event.target.value))}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="destination-pointer">
              Destination Wallet Address (Open Payments pointer)
            </Label>
            <Input
              id="destination-pointer"
              value={destinationPointer}
              onChange={(event) => setDestinationPointer(event.target.value)}
              required
            />
          </div>

          <Button type="submit" disabled={isLoading} className="w-full sm:w-fit">
            {isLoading ? "Running..." : "Run Payroll"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
