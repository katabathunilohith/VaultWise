"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { clearApiCache } from "@/lib/client";
import { BRAND } from "@/lib/shared";
import { Button, ToastProvider, cx } from "@/components/ui";
import { signOutNow, useSession } from "./session";

function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#2a78d6" />
      <path d="M9 10.5h3.2l3.8 9.4 3.8-9.4H23l-5.5 12.5h-3z" fill="#fff" />
    </svg>
  );
}

/** Signs out, forgets cached data and goes home. */
export function useSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await signOutNow();
      clearApiCache();
      router.push("/");
    } finally {
      setBusy(false);
    }
  };
  return { signOut: run, busy };
}

export function SignOutButton({ size = "sm", variant = "secondary" }: { size?: "sm" | "md"; variant?: "secondary" | "ghost" }) {
  const { signOut, busy } = useSignOut();
  return (
    <Button size={size} variant={variant} loading={busy} icon={<LogOut className="size-4" />} onClick={signOut}>
      Sign out
    </Button>
  );
}

/** Full-screen layout for screens shown before the app opens: sign-in and recovery. */
export function AuthFrame({ children, aside, top }: { children: ReactNode; aside?: ReactNode; top?: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_1.1fr]">
      <section className="relative hidden overflow-hidden bg-brand px-12 py-14 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5">
          <Mark className="size-9" />
          <span className="text-lg font-semibold">{BRAND.name}</span>
        </div>
        <div className="mt-auto max-w-md">
          {aside ?? (
            <>
              <h1 className="text-4xl font-semibold leading-tight tracking-tight">{BRAND.tagline}</h1>
              <p className="mt-4 text-[15px] leading-relaxed text-brand-muted">
                Sign in to see your vaults. Money only moves after we&apos;ve checked your ID, so your savings stay yours.
              </p>
            </>
          )}
        </div>
        <p className="mt-10 flex items-center gap-1.5 text-xs text-brand-muted/80">
          <ShieldCheck className="size-3.5" aria-hidden /> We never store your full ID number.
        </p>
      </section>
      <section className="flex flex-col px-5 py-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 lg:invisible">
            <Mark className="size-8" />
            <span className="text-lg font-semibold">{BRAND.name}</span>
          </div>
          {top}
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </section>
    </div>
  );
}

/** "Signed in as" with a sign-out button, for screens outside the customer shell. */
export function SignedInAs() {
  const session = useSession();
  if (session.status !== "signed_in") return null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden min-w-0 truncate text-[13px] text-muted sm:inline">{session.email ?? "Signed in"}</span>
      <SignOutButton variant="ghost" />
    </div>
  );
}

/** Shown over onboarding when someone is signed in but has no wallet yet. Renders nothing when sign-in is off. */
export function SignedInChip() {
  const session = useSession();
  if (session.status !== "signed_in") return null;
  return (
    <div className="fixed top-3 right-3 z-30 flex max-w-[calc(100%-24px)] flex-wrap items-center justify-end gap-x-3 gap-y-1 rounded-xl border border-line bg-surface/95 px-3 py-1.5 text-[13px] shadow-card backdrop-blur">
      <span className="min-w-0 truncate text-muted">{session.email ?? "Signed in"}</span>
      <Link href="/recover" className="font-medium text-accent-ink hover:underline">
        Recover an account instead
      </Link>
      <SignOutButton variant="ghost" />
    </div>
  );
}

const OPS_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/kyc", label: "ID checks" },
  { href: "/admin/recovery", label: "Recovery" },
];

/** A plain frame for the ops console when the signed-in reviewer has no wallet of their own. */
export function OpsFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const session = useSession();
  return (
    <ToastProvider>
      <div className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-line bg-brand text-white">
          <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center gap-4 px-4 sm:px-6 lg:px-10">
            <Link href="/admin" className="flex items-center gap-2">
              <Mark className="size-7" />
              <span className="font-semibold">Ops console</span>
            </Link>
            <nav className="flex flex-1 gap-1 overflow-x-auto" aria-label="Operations">
              {OPS_LINKS.map((l) => {
                const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium",
                      active ? "bg-white/12 text-white" : "text-brand-muted hover:text-white",
                    )}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </nav>
            <span className="hidden truncate text-[13px] text-brand-muted md:inline">{session.status === "signed_in" ? session.email : ""}</span>
            <OpsSignOut />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
      </div>
    </ToastProvider>
  );
}

function OpsSignOut() {
  const { signOut, busy } = useSignOut();
  return (
    <button
      onClick={signOut}
      disabled={busy}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-brand-muted hover:text-white disabled:opacity-50"
    >
      <LogOut className="size-4" aria-hidden /> Sign out
    </button>
  );
}
