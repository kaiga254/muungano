"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";

const CURRENCIES = [
  { value: "KES", label: "KES – Kenyan Shilling" },
  { value: "MWK", label: "MWK – Malawian Kwacha" },
  { value: "USD", label: "USD – US Dollar" },
];

const COUNTRIES = [
  { value: "KE", label: "Kenya" },
  { value: "MW", label: "Malawi" },
];

export default function SignupPage() {
  const router = useRouter();
  const { refresh } = useAuth();

  const [companyName, setCompanyName] = useState("");
  const [companyCountry, setCompanyCountry] = useState("KE");
  const [companyCurrency, setCompanyCurrency] = useState("KES");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const signupRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          companyCountry,
          companyCurrency,
          fullName,
          email,
          password,
        }),
      });

      const signupData = (await signupRes.json()) as { error?: string };
      if (!signupRes.ok) {
        throw new Error(signupData.error ?? "Signup failed.");
      }

      // Auto-login after signup
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const loginData = (await loginRes.json()) as { error?: string };
      if (!loginRes.ok) {
        throw new Error(loginData.error ?? "Auto-login failed after signup.");
      }

      await refresh();
      router.push("/employees");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center justify-center px-4 py-12">
      <Card className="w-full border-border/70 bg-card/95 shadow-xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>
            Set up your payroll workspace. You&apos;ll be the HR admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-5">
            <div className="grid gap-4 rounded-lg border border-border/60 bg-muted/30 p-4">
              <p className="text-sm font-medium text-muted-foreground">Company details</p>
              <div className="grid gap-2">
                <Label htmlFor="company-name">Company name</Label>
                <Input
                  id="company-name"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Ltd"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="company-country">Country</Label>
                  <select
                    id="company-country"
                    value={companyCountry}
                    onChange={(e) => setCompanyCountry(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="company-currency">Primary currency</Label>
                  <select
                    id="company-currency"
                    value={companyCurrency}
                    onChange={(e) => setCompanyCurrency(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid gap-4 rounded-lg border border-border/60 bg-muted/30 p-4">
              <p className="text-sm font-medium text-muted-foreground">Your HR admin account</p>
              <div className="grid gap-2">
                <Label htmlFor="full-name">Full name</Label>
                <Input
                  id="full-name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@company.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            </div>

            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creating account…" : "Create account"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
