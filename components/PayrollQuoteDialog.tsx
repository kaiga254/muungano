"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PayrollQuote } from "@/services/quoteService";

type PayrollQuoteDialogProps = {
  quote: PayrollQuote | null;
  open: boolean;
  approving: boolean;
  onApprove: () => void;
  onReject: () => void;
};

/** Returns seconds remaining until `expiresAt`; negative when expired. */
function useCountdown(expiresAt: string | undefined): number {
  const [remaining, setRemaining] = useState(() =>
    expiresAt ? Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000) : 0,
  );

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () =>
      setRemaining(Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PayrollQuoteDialog({
  quote,
  open,
  approving,
  onApprove,
  onReject,
}: PayrollQuoteDialogProps) {
  const countdown = useCountdown(quote?.expiresAt);
  const isExpired = countdown <= 0;

  if (!quote) return null;

  const netReceived = quote.destinationAmount - quote.transactionFee;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onReject(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Payroll Quote
            <Badge
              variant={isExpired ? "destructive" : "secondary"}
              className="ml-auto font-mono text-xs"
            >
              {isExpired ? "Expired" : `Expires in ${formatCountdown(countdown)}`}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Review the breakdown below before approving. The transaction will only
            proceed after your confirmation.
          </DialogDescription>
        </DialogHeader>

        {/* Employee + initiator */}
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
          <div>
            <div className="text-muted-foreground">Employee</div>
            <div className="font-semibold">{quote.employeeName}</div>
          </div>
          {quote.payPeriod && (
            <div>
              <div className="text-muted-foreground">Pay period</div>
              <div className="font-semibold">{quote.payPeriod}</div>
            </div>
          )}
          <div>
            <div className="text-muted-foreground">Destination</div>
            <div className="truncate font-medium text-xs">
              {quote.destinationPointer}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Quote ID</div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {quote.id.slice(0, 8)}…
            </div>
          </div>
        </div>

        <Separator />

        {/* Financial summary */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Gross salary (MWK)</span>
            <span className="font-semibold">
              MWK {quote.sourceAmount.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Exchange rate</span>
            <span>
              1 MWK = {quote.exchangeRate.toFixed(4)} KES
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Settled amount (KES)</span>
            <span>KES {quote.destinationAmount.toLocaleString()}</span>
          </div>
          {quote.transactionFee > 0 && (
            <div className="flex justify-between text-destructive">
              <span>Transaction fee</span>
              <span>− KES {quote.transactionFee.toLocaleString()}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-base font-semibold">
            <span>Net received (KES)</span>
            <span className="text-green-600 dark:text-green-400">
              KES {netReceived.toLocaleString()}
            </span>
          </div>
        </div>

        <Separator />

        {/* Splits breakdown */}
        <div>
          <h4 className="mb-2 text-sm font-semibold">Allocation breakdown</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Obligation</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Amount (KES)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quote.splits.map((split) => (
                <TableRow key={split.key}>
                  <TableCell>{split.label}</TableCell>
                  <TableCell className="text-right">{split.percentage}%</TableCell>
                  <TableCell className="text-right font-mono">
                    {split.amount.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {isExpired && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            This quote has expired. Close this dialog and generate a new one.
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="outline" onClick={onReject} disabled={approving}>
            Cancel
          </Button>
          <Button
            onClick={onApprove}
            disabled={approving || isExpired}
          >
            {approving ? "Processing…" : "Approve & Run Payroll"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
