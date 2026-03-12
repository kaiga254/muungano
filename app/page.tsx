export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center gap-6 px-6">
      <h1 className="text-4xl font-bold">Muungano</h1>
      <p className="max-w-2xl text-base opacity-90">
        ILP-based cross-border payroll infrastructure prototype. Execute
        salaries from Malawi to Kenya, settle over Rafiki/Open Payments, then
        auto-route obligations to wallet, savings, school, and insurance.
      </p>
      <div>
        <a
          href="/dashboard"
          className="inline-block rounded bg-foreground px-5 py-3 text-sm font-semibold text-background"
        >
          Open Dashboard
        </a>
      </div>
    </main>
  );
}
