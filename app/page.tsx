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
              Interledger Wallet · ILP + Open Payments
            </Badge>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
                Your multi-currency wallet on the Interledger network.
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
                Hold KES, MWK, and USD. Deposit via bank or mobile money,
                send cross-border ILP payments, and withdraw — all from one
                open-standard wallet.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup">
                <Button size="lg">Get started</Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline">
                  Sign in
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid gap-4 rounded-xl border border-border/70 bg-muted/40 p-6">
            <div>
                <p className="text-sm font-medium text-muted-foreground">How it works</p>
              <p className="mt-2 text-lg font-semibold">
                 KES · MWK · USD settlement wallet
              </p>
            </div>
            <div className="grid gap-3 text-sm text-muted-foreground">
              <div className="rounded-lg border border-border/70 bg-background/80 p-4">
                 Sign up with your phone number and complete Tier-1 KYC to
                 unlock cross-border transfers.
              </div>
              <div className="rounded-lg border border-border/70 bg-background/80 p-4">
                 Deposit via M-Pesa or bank transfer. Get a live FX quote and
                 send to any ILP address in seconds.
              </div>
              <div className="rounded-lg border border-border/70 bg-background/80 p-4">
                 Double-entry ledger on Neon PostgreSQL — every cent accounted
                 for, every movement traceable.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
