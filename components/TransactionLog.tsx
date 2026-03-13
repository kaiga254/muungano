type DistributionResult = {
  obligation: string;
  status: "SUCCESS" | "FAILED";
};

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type TransactionItem = {
  id: string;
  employeeName: string;
  sourceAmount: number;
  destinationAmount: number;
  status: string;
  createdAt: string;
  distributionResults: DistributionResult[];
};

type TransactionLogProps = {
  logs: TransactionItem[];
  maxHeightClassName?: string;
};

export default function TransactionLog({
  logs,
  maxHeightClassName = "max-h-[32rem]",
}: TransactionLogProps) {
  return (
    <Card className="border-border/70 bg-card/95">
      <CardHeader>
        <CardTitle>Transaction Log</CardTitle>
        <CardDescription>
          Recent payroll executions and downstream delivery status.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!logs.length ? (
          <p className="text-sm text-muted-foreground">
            No payroll executions yet.
          </p>
        ) : (
          <div className={`${maxHeightClassName} overflow-y-auto pr-1`}>
            <ul className="grid gap-3">
              {logs.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-lg border border-border/70 bg-muted/35 p-4 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{entry.employeeName}</span>
                    <span className="text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 text-muted-foreground">
                    MWK {entry.sourceAmount.toLocaleString()} → KES{" "}
                    {entry.destinationAmount.toLocaleString()} · {entry.status}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {entry.distributionResults.map((result) => (
                      <Badge
                        key={`${entry.id}-${result.obligation}`}
                        variant={
                          result.status === "SUCCESS"
                            ? "success"
                            : "destructive"
                        }
                      >
                        {result.obligation}: {result.status}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
