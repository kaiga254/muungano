import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const simulators = [
  {
    key: "mpesa",
    title: "M-Pesa Simulator",
    description:
      "Wallet-style employee sub-accounts with real-time credit/debit ledger from Neon.",
  },
  {
    key: "bank",
    title: "Bank Simulator",
    description:
      "Employee bank sub-accounts for remittance and school-fee payment flows.",
  },
  {
    key: "sacco",
    title: "SACCO Simulator",
    description:
      "Savings-focused employee sub-accounts with cumulative contribution history.",
  },
  {
    key: "insurance",
    title: "Insurance Simulator",
    description:
      "Premium sub-accounts with transaction timeline and per-employee balances.",
  },
] as const;

export default function SimulatorsHubPage() {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-7xl gap-6 px-4 py-8">
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-3xl font-semibold tracking-tight">
              Simulator Hub
            </CardTitle>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              Neon-backed ledgers
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Each simulator now has its own interface and employee sub-accounts.
            Payroll distribution writes transactions directly to Neon, so
            balances and histories update immediately after settlement.
          </p>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        {simulators.map((simulator) => (
          <Card key={simulator.key} className="border-border/70 bg-card/95">
            <CardHeader>
              <CardTitle>{simulator.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {simulator.description}
              </p>
              <Link href={`/simulators/${simulator.key}`}>
                <Button variant="outline">Open {simulator.title}</Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
