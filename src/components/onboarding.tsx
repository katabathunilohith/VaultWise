"use client";

import { useEffect, useState } from "react";
import { CircleCheck, FileCheck2, LoaderCircle, Lock, MapPin, Siren, TrendingUp } from "lucide-react";
import { api } from "@/lib/client";
import { BRAND } from "@/lib/shared";
import { countryFlag, detectRegion, regionName, type RegionGuess } from "@/lib/region";
import { Button, ErrorNote, Field, Input, Notice, Select, Toggle, cx } from "./ui";

export interface CountryOption {
  code: string;
  name: string;
  market: string;
  flag: string;
  currency: string;
  marketName: string;
}

const PILLARS = [
  { icon: Lock, title: "Purpose-locked vaults", body: "Health, education, housing and more — money that's structurally harder to raid." },
  { icon: FileCheck2, title: "AI-verified redemption", body: "Release funds against a receipt, checked in seconds with a human safety net." },
  { icon: Siren, title: "Tiered emergency access", body: "One tap from your Health vault when it matters, with guardrails against misuse." },
  { icon: TrendingUp, title: "Core / Satellite investing", body: "Low-cost index SIPs, plus an opt-in, capped systematic sleeve." },
];

const STEPS = [
  "Verifying identity with KYC partner (simulated)",
  "Opening your wallet and double-entry ledger",
  "Creating vaults and replaying four months of activity",
  "Buying Core ETFs at real historical prices",
  "Running the Satellite paper engine on live market data",
];

/** Groups countries by market so the rule set and currency are obvious. */
function CountrySelect({ countries, value, onChange }: { countries: CountryOption[]; value: string; onChange: (cc: string) => void }) {
  const groups = new Map<string, CountryOption[]>();
  for (const c of countries) groups.set(c.marketName, [...(groups.get(c.marketName) ?? []), c]);
  return (
    <Select id="ob-country" value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="" disabled>
        Choose your country…
      </option>
      {[...groups.entries()].map(([market, list]) => (
        <optgroup key={market} label={`${market} · ${list[0].currency}`}>
          {[...list]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}

export function Onboarding({ countries, onDone }: { countries: CountryOption[]; onDone: () => void }) {
  const [name, setName] = useState("Alex Morgan");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [guess, setGuess] = useState<RegionGuess | null>(null);
  const selected = countries.find((c) => c.code === country) ?? null;
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [demo, setDemo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Suggest a country from the network (when deployed behind a CDN), the device time zone and browser languages.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let networkCountry: string | null = null;
      try {
        networkCountry = (await api.get<{ networkCountry: string | null }>("/api/v1/region")).networkCountry;
      } catch {
        // detection is best-effort
      }
      const g = detectRegion({ networkCountry, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, languages: navigator.languages });
      if (cancelled) return;
      setGuess(g);
      if (g.supported && g.country) setCountry((cur) => cur || g.country!);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), demo ? 1900 : 500);
    return () => clearInterval(id);
  }, [busy, demo]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,6}$/.test(pin)) return setError("Choose a 4–6 digit PIN");
    if (pin !== pin2) return setError("PINs don't match");
    if (!country) return setError("Choose the country where you live and bank");
    setBusy(true);
    setStep(0);
    try {
      await api.post("/api/v1/onboarding", { name, email, country, pin, demo });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand px-12 py-14 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="size-9" aria-hidden>
            <rect width="32" height="32" rx="9" fill="#2a78d6" />
            <path d="M9 10.5h3.2l3.8 9.4 3.8-9.4H23l-5.5 12.5h-3z" fill="#fff" />
          </svg>
          <span className="text-lg font-semibold">{BRAND.name}</span>
        </div>
        <div className="mt-auto max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">{BRAND.tagline}</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-brand-muted">
            Most people don&apos;t fail to save because they lack a place to put money — they fail because it&apos;s too easy to spend. {BRAND.name}{" "}
            ties every withdrawal to proof of its purpose, and keeps a fast, guarded path open for real emergencies.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-5">
            {PILLARS.map((p) => (
              <div key={p.title} className="rounded-xl bg-white/6 p-4">
                <p.icon className="size-5 text-[#86b6ef]" aria-hidden />
                <div className="mt-2.5 text-sm font-semibold">{p.title}</div>
                <div className="mt-1 text-[13px] leading-snug text-brand-muted">{p.body}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-10 text-xs text-brand-muted/80">
          Capstone prototype. Banking, brokerage and KYC partners are simulated; market data is live.
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          {busy ? (
            <div className="vw-in">
              <h2 className="text-2xl font-semibold tracking-tight">Setting up your wallet</h2>
              <p className="mt-1 text-sm text-ink-2">{demo ? "This takes about 15 seconds — it pulls live market data." : "One moment…"}</p>
              <ol className="mt-8 space-y-4">
                {STEPS.slice(0, demo ? STEPS.length : 2).map((s, i) => (
                  <li key={s} className={cx("flex items-center gap-3 text-sm", i > step ? "text-muted" : "text-ink")}>
                    {i < step ? (
                      <CircleCheck className="size-5 text-good" aria-hidden />
                    ) : i === step ? (
                      <LoaderCircle className="size-5 animate-spin text-accent" aria-hidden />
                    ) : (
                      <span className="size-5 rounded-full border-2 border-line-strong" aria-hidden />
                    )}
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <form onSubmit={submit} className="vw-in space-y-5">
              <div>
                <div className="mb-6 flex items-center gap-2 lg:hidden">
                  <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
                    <rect width="32" height="32" rx="9" fill="#2a78d6" />
                    <path d="M9 10.5h3.2l3.8 9.4 3.8-9.4H23l-5.5 12.5h-3z" fill="#fff" />
                  </svg>
                  <span className="text-lg font-semibold">{BRAND.name}</span>
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">Open your wallet</h2>
                <p className="mt-1 text-sm text-ink-2">Your country sets the currency, guardrails and disclosures.</p>
              </div>
              <Field label="Full name" htmlFor="ob-name">
                <Input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" />
              </Field>
              <Field label="Email" hint="Optional" htmlFor="ob-email">
                <Input id="ob-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label="Country of residence" htmlFor="ob-country">
                <CountrySelect countries={countries} value={country} onChange={setCountry} />
              </Field>
              {selected ? (
                <div className="-mt-2 space-y-1.5">
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent-ink">Wallet currency: {selected.currency}</span>
                    <span className="rounded-full bg-sunken px-2 py-0.5 text-ink-2">Rules: {selected.marketName}</span>
                  </div>
                  {guess?.supported && guess.country === country && (
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <MapPin className="size-3.5" aria-hidden /> Suggested from {guess.detail}. Change it if you live and bank elsewhere.
                    </p>
                  )}
                </div>
              ) : guess?.country && !guess.supported ? (
                <Notice tone="warn" title={`${countryFlag(guess.country)} ${regionName(guess.country)} isn't supported yet`}>
                  We detected it from {guess.detail}. Choose a supported country where you have a bank account to continue.
                </Notice>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Security PIN" hint="For Tier 2 emergency access" htmlFor="ob-pin">
                  <Input
                    id="ob-pin"
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    maxLength={6}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="Confirm PIN" htmlFor="ob-pin2">
                  <Input
                    id="ob-pin2"
                    type="password"
                    inputMode="numeric"
                    value={pin2}
                    onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
                    maxLength={6}
                    autoComplete="new-password"
                  />
                </Field>
              </div>
              <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-surface p-4">
                <div>
                  <div className="text-sm font-medium">Start with demo history</div>
                  <p className="mt-0.5 text-[13px] text-muted">
                    Six vaults, four months of salary, card spend, round-ups, SIPs, a verified withdrawal and an emergency — all through the real
                    ledger.
                  </p>
                </div>
                <Toggle checked={demo} onChange={setDemo} label="Start with demo history" />
              </div>
              {error && <ErrorNote>{error}</ErrorNote>}
              <Button type="submit" size="lg" className="w-full" variant="brand">
                Create wallet
              </Button>
              <p className="text-center text-xs text-muted">Identity verification is simulated in this prototype.</p>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
