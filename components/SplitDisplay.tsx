import type { SalarySplit } from "@/services/payrollService";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SplitDisplayProps = {
  splits: SalarySplit[];
  total: number;
  currency: string;
};

export default function SplitDisplay({
  splits,
  total,
  currency,
}: SplitDisplayProps) {
  if (!splits.length) {
    return null;
  }

  return (
    <Card className="border-border/70 bg-card/95">
      <CardHeader>
        <CardTitle>Obligation Routing</CardTitle>
        <CardDescription>
          Total settled to Kenya: {currency} {total.toLocaleString()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3">
          {splits.map((split) => (
            <li
              key={split.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/40 px-4 py-3"
            >
              <span className="font-medium">{split.label}</span>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{split.percentage}%</Badge>
                <Badge variant="outline">
                  {split.currency} {split.amount.toLocaleString()}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
