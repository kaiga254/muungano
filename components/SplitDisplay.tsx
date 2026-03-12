import type { SalarySplit } from "@/services/payrollService";

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
    <section className="rounded-lg border border-foreground/20 p-5">
      <h3 className="mb-3 text-lg font-semibold">Obligation Routing</h3>
      <div className="mb-4 text-sm">
        Total settled to Kenya: {currency} {total.toLocaleString()}
      </div>
      <ul className="grid gap-2">
        {splits.map((split) => (
          <li
            key={split.key}
            className="flex items-center justify-between rounded border border-foreground/15 px-3 py-2"
          >
            <span>{split.label}</span>
            <span className="font-medium">
              {split.percentage}% · {split.currency}{" "}
              {split.amount.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
