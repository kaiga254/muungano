type DistributionResult = {
  obligation: string;
  status: "SUCCESS" | "FAILED";
};

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
};

export default function TransactionLog({ logs }: TransactionLogProps) {
  return (
    <section className="rounded-lg border border-foreground/20 p-5">
      <h3 className="mb-3 text-lg font-semibold">Transaction Log</h3>
      {!logs.length ? (
        <p className="text-sm opacity-80">No payroll executions yet.</p>
      ) : (
        <ul className="grid gap-3">
          {logs.map((entry) => (
            <li
              key={entry.id}
              className="rounded border border-foreground/15 p-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{entry.employeeName}</span>
                <span>{new Date(entry.createdAt).toLocaleString()}</span>
              </div>
              <div className="mt-1">
                MWK {entry.sourceAmount.toLocaleString()} → KES{" "}
                {entry.destinationAmount.toLocaleString()} · {entry.status}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {entry.distributionResults.map((result) => (
                  <span
                    key={`${entry.id}-${result.obligation}`}
                    className="rounded border border-foreground/20 px-2 py-1"
                  >
                    {result.obligation}: {result.status}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
