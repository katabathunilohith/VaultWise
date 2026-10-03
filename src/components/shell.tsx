"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import {
  Activity,
  Bot,
  Gauge,
  Landmark,
  LayoutDashboard,
  Menu,
  Monitor,
  Moon,
  PiggyBank,
  Settings,
  ShieldCheck,
  Siren,
  Sun,
  TrendingUp,
  X,
} from "lucide-react";
import { clearApiCache, useApi } from "@/lib/client";
import { BRAND } from "@/lib/shared";
import type { JurisdictionRules } from "@/lib/compliance";
import { cx, Skeleton, ToastProvider } from "./ui";
import { Onboarding, type CountryOption } from "./onboarding";

export interface Me {
  onboarded: boolean;
  aiEnabled?: boolean;
  user?: {
    id: string;
    name: string;
    email: string | null;
    jurisdiction: string;
    country: { code: string; name: string; flag: string; currency: string; marketName: string } | null;
    currency: string;
    kycStatus: string;
    kycLevel: number;
    plan: string;
    riskProfile: { score: number; band: number; bandName: string; experience: number } | null;
    satelliteOptIn: boolean;
    createdAt: number;
  };
  rules?: JurisdictionRules;
  jurisdictions: { code: string; name: string; currency: string; flag: string }[];
  countries: CountryOption[];
}

const MeCtx = createContext<{ me: Required<Pick<Me, "user" | "rules">> & Me; reload: () => void } | null>(null);

export function useMe() {
  const v = useContext(MeCtx);
  if (!v) throw new Error("useMe outside shell");
  return { ...v.me, user: v.me.user!, rules: v.me.rules!, reload: v.reload };
}

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/vaults", label: "Vaults", icon: PiggyBank },
  { href: "/emergency", label: "Emergency access", icon: Siren, emphasis: true },
  { href: "/invest", label: "Invest", icon: TrendingUp },
  { href: "/accounts", label: "Linked accounts", icon: Landmark },
  { href: "/assistant", label: "Assistant", icon: Bot },
  { href: "/activity", label: "Activity & audit", icon: Activity },
];

const OPS = [{ href: "/admin", label: "Ops console", icon: Gauge }];

type ThemePref = "light" | "dark" | "system";

function applyTheme(t: ThemePref) {
  const el = document.documentElement;
  if (t === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", t);
}

function readThemePref(): ThemePref {
  try {
    return (localStorage.getItem("vw-theme") as ThemePref) || "system";
  } catch {
    return "system";
  }
}

// Rendered only after /me loads on the client, so reading storage in the initializer is safe.
function ThemeSwitch() {
  const [pref, setPref] = useState<ThemePref>(readThemePref);
  const set = (t: ThemePref) => {
    setPref(t);
    applyTheme(t);
    try {
      localStorage.setItem("vw-theme", t);
    } catch {
      // storage unavailable
    }
  };
  const opts: { v: ThemePref; icon: ReactNode; label: string }[] = [
    { v: "light", icon: <Sun className="size-3.5" />, label: "Light theme" },
    { v: "system", icon: <Monitor className="size-3.5" />, label: "System theme" },
    { v: "dark", icon: <Moon className="size-3.5" />, label: "Dark theme" },
  ];
  return (
    <div className="flex rounded-lg bg-white/5 p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => set(o.v)}
          aria-label={o.label}
          aria-pressed={pref === o.v}
          className={cx(
            "flex flex-1 items-center justify-center rounded-md py-1.5 text-brand-muted transition-colors",
            pref === o.v ? "bg-white/15 text-white" : "hover:text-white",
          )}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#2a78d6" />
        <path d="M9 10.5h3.2l3.8 9.4 3.8-9.4H23l-5.5 12.5h-3z" fill="#fff" />
      </svg>
      <div>
        <div className="text-[15px] font-semibold leading-tight text-white">{BRAND.name}</div>
        <div className="text-[11px] leading-tight text-brand-muted">Purpose-locked savings</div>
      </div>
    </Link>
  );
}

function SideNav({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const item = (n: (typeof NAV)[number]) => (
    <Link
      key={n.href}
      href={n.href}
      onClick={onNavigate}
      className={cx(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        isActive(n.href) ? "bg-white/12 text-white" : "text-brand-muted hover:bg-white/6 hover:text-white",
      )}
      aria-current={isActive(n.href) ? "page" : undefined}
    >
      <n.icon className={cx("size-[18px]", n.emphasis && !isActive(n.href) && "text-[#ff8a8a]")} aria-hidden />
      {n.label}
    </Link>
  );
  return (
    <div className="flex h-full flex-col gap-6 px-3 py-5">
      <Logo />
      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {NAV.map(item)}
      </nav>
      <div>
        <div className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-brand-muted/70">Operations</div>
        <nav className="flex flex-col gap-0.5" aria-label="Operations">
          {OPS.map((n) => item(n as (typeof NAV)[number]))}
        </nav>
      </div>
      <div className="mt-auto flex flex-col gap-3">
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cx(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
            isActive("/settings") ? "bg-white/12 text-white" : "text-brand-muted hover:bg-white/6 hover:text-white",
          )}
        >
          <Settings className="size-[18px]" aria-hidden /> Settings & privacy
        </Link>
        {me.user && (
          <div className="rounded-xl bg-white/6 p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
                {me.user.name
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">{me.user.name}</div>
                <div className="flex items-center gap-1 text-[11px] text-brand-muted">
                  <ShieldCheck className="size-3" aria-hidden /> KYC verified · {me.user.country?.flag ?? me.rules?.flag} {me.user.currency}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <ThemeSwitch />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { data: me, reload, error } = useApi<Me>("/api/v1/me");
  const [mobileOpen, setMobileOpen] = useState(false);

  if (error && !me)
    return <div className="flex min-h-screen items-center justify-center p-6 text-sm text-ink-2">Couldn&apos;t reach the server: {error}</div>;
  if (!me)
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-64 bg-brand lg:block" />
        <div className="flex-1 space-y-4 p-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  if (!me.onboarded)
    return (
      <Onboarding
        countries={me.countries}
        onDone={() => {
          clearApiCache();
          reload();
        }}
      />
    );

  return (
    <ToastProvider>
      <MeCtx.Provider value={{ me: me as Required<Pick<Me, "user" | "rules">> & Me, reload }}>
        <div className="min-h-screen lg:pl-64">
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-brand lg:block">
            <SideNav me={me} />
          </aside>
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-brand px-4 lg:hidden">
            <Logo />
            <button onClick={() => setMobileOpen(true)} className="rounded-md p-2 text-white" aria-label="Open menu">
              <Menu className="size-5" />
            </button>
          </header>
          {mobileOpen && (
            <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal>
              <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
              <div className="absolute inset-y-0 left-0 w-72 bg-brand shadow-pop">
                <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-3 rounded-md p-1.5 text-white" aria-label="Close menu">
                  <X className="size-5" />
                </button>
                <SideNav me={me} onNavigate={() => setMobileOpen(false)} />
              </div>
            </div>
          )}
          <main className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
        </div>
      </MeCtx.Provider>
    </ToastProvider>
  );
}
