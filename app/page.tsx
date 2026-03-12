import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-12">
      <Card className="overflow-hidden border-border/70 bg-card/95 shadow-xl backdrop-blur-sm">
        <CardContent className="grid gap-10 p-8 md:grid-cols-[1.2fr_0.8fr] md:p-12">
          <div className="space-y-6">
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
              ILP + Rafiki Payroll Prototype
            </Badge>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
                Muungano cross-border payroll with visible settlement simulators.
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
                Execute salaries from Malawi to Kenya, settle over Rafiki/Open Payments,
                and route obligations into wallet, family remittance, SACCO, school,
                and insurance interfaces.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard">
                <Button size="lg">Open Dashboard</Button>
              </Link>
              <Link href="/simulators">
                <Button size="lg" variant="outline">
                  Open Simulators
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid gap-4 rounded-xl border border-border/70 bg-muted/40 p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Flow</p>
              <p className="mt-2 text-lg font-semibold">MWK → KES programmable payroll</p>
            </div>
            <div className="grid gap-3 text-sm text-muted-foreground">
              <div className="rounded-lg border border-border/70 bg-background/80 p-4">
                Quote creation and payment dispatch through Rafiki services.
              </div>
              <div className="rounded-lg border border-border/70 bg-background/80 p-4">
                Visual simulator state for MPESA, bank, SACCO, and insurance.
              </div>
              <div className="rounded-lg border border-border/70 bg-background/80 p-4">
                Persistent payroll and simulator ledgers stored in PostgreSQL.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
