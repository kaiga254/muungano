"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const NAV_LINKS = [
  { href: "/dashboard", label: "Home" },
  { href: "/wallets", label: "Wallets" },
  { href: "/send", label: "Send" },
  { href: "/deposit", label: "Deposit" },
  { href: "/history", label: "History" },
  { href: "/simulators", label: "Simulators" },
];

export default function AppNav() {
  const { session, logout, loading } = useAuth();
  const pathname = usePathname();

  if (loading || !session) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">
              Muungano
            </span>
            <Badge
              variant="secondary"
              className="hidden sm:flex rounded-full px-2 py-0.5 text-xs"
            >
                Wallet
            </Badge>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {NAV_LINKS.map((link) => {
                const active = pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link key={link.href} href={link.href}>
                  <Button
                    variant={active ? "secondary" : "ghost"}
                    size="sm"
                    className="text-sm"
                  >
                    {link.label}
                  </Button>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right text-sm sm:block">
            <div className="font-medium leading-tight">{session.fullName}</div>
            <div className="text-xs text-muted-foreground">
                {session.phone}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
