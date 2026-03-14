"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Payment = {
  id: string;
  amount: number;
  currency: string;
  receiverIdentifier: string;
  status: string;
  createdAt: string;
};

type Transfer = {
  id: string;
  sourceAmount: number;
  sourceCurrency: string;
  destAmount: number;
  destCurrency: string;
  fxRate: number;
  status: string;
  createdAt: string;
};

function status2Badge(status: string) {
  switch (status) {
    case "completed":
      return (
        <Badge className="bg-green-500/15 text-green-700 dark:text-green-400">
          Completed
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400">
          Pending
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-500/15 text-red-700 dark:text-red-400">
          Failed
        </Badge>
      );
    case "reversed":
      return <Badge variant="outline">Reversed</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function fmt(amount: string, currency: string): string {
  return (
    (Number(amount) / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
    }) +
    " " +
    currency
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [payPage, setPayPage] = useState(0);
  const [xfrPage, setXfrPage] = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => {
    void (async () => {
      const res = await fetch(
        `/api/payments/history?limit=${PAGE_SIZE}&offset=${payPage * PAGE_SIZE}`,
      );
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.ok) {
        const d = (await res.json()) as { payments?: Payment[] };
        setPayments(d.payments ?? []);
      }
    })();
  }, [router, payPage]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(
        `/api/transfers?limit=${PAGE_SIZE}&offset=${xfrPage * PAGE_SIZE}`,
      );
      if (res.ok) {
        const d = (await res.json()) as { transfers?: Transfer[] };
        setTransfers(d.transfers ?? []);
      }
    })();
  }, [xfrPage]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Transaction History
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ILP payments and internal currency conversions.
        </p>
      </div>

      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">ILP Payments</TabsTrigger>
          <TabsTrigger value="transfers">Conversions</TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="mt-4">
          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">ILP Payments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground py-8"
                      >
                        No payments yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm font-mono max-w-50 truncate">
                        {p.receiverIdentifier}
                      </TableCell>
                      <TableCell className="text-sm">
                        {fmt(String(p.amount), p.currency)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">—</TableCell>
                      <TableCell>{status2Badge(p.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-between items-center px-4 py-3 border-t border-border/60">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={payPage === 0}
                  onClick={() => setPayPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {payPage + 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={payments.length < PAGE_SIZE}
                  onClick={() => setPayPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transfers" className="mt-4">
          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Currency Conversions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground py-8"
                      >
                        No conversions yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {transfers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {fmt(String(t.sourceAmount), t.sourceCurrency)}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-green-600">
                        {fmt(String(t.destAmount), t.destCurrency)}
                      </TableCell>
                      <TableCell>{status2Badge(t.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-between items-center px-4 py-3 border-t border-border/60">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={xfrPage === 0}
                  onClick={() => setXfrPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {xfrPage + 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={transfers.length < PAGE_SIZE}
                  onClick={() => setXfrPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
