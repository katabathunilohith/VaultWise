"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Fuel, LoaderCircle, MapPin } from "lucide-react";
import { api } from "@/lib/client";
import { BRAND } from "@/lib/shared";
import { countryFlag, detectRegion, regionName, type RegionGuess } from "@/lib/region";
import { Button, ErrorNote, Field, Input, Notice, Select, Toggle } from "./ui";

export interface CountryOption {
  code: string;
  name: string;
  market: string;
  flag: string;
  currency: string;
  marketName: string;
}

const PILLARS = [
  { icon: Fuel, title: "Tomorrow’s shift", body: "Allow for petrol or charging before deciding what you can spend today." },
  { icon: CalendarDays, title: "A late payout", body: "See which bill falls short if your pay arrives a few days later." },
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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [guess, setGuess] = useState<RegionGuess | null>(null);
  const selected = countries.find((c) => c.code === country) ?? null;
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // mpin: new accounts choose a 6-digit MPIN; the server refuses easy ones (e.g. 123456) with a reason.
    if (!/^\d{6}$/.test(pin)) return setError("Choose a 6-digit MPIN");
    if (pin !== pin2) return setError("MPINs don't match");
    if (!country) return setError("Choose the country where you live and bank");
    setBusy(true);
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
            Start with the cash you have today. Enter the work costs and bills due before your next delivery payout to see how much you have left.
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
          Capstone prototype. All wallet balances and transfers use practice money.
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          {busy ? (
            <div className="vw-in flex items-center gap-3" role="status">
              <LoaderCircle className="size-5 animate-spin text-accent" aria-hidden />
              <h2 className="text-xl font-semibold tracking-tight">{demo ? "Preparing your sample wallet history…" : "Setting up your account…"}</h2>
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
                <h2 className="text-2xl font-semibold tracking-tight">Set up your account</h2>
                <p className="mt-1 text-sm text-ink-2">Save payout plans in your local currency. You can try the planner with an example.</p>
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
                <Field label="MPIN (6 digits)" hint="You'll enter it for every money move" htmlFor="ob-pin">
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
                <Field label="Confirm MPIN" htmlFor="ob-pin2">
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
                    Add four months of sample activity to the practice wallet. You can use the payout planner with either setting.
                  </p>
                </div>
                <Toggle checked={demo} onChange={setDemo} label="Start with demo history" />
              </div>
              {error && <ErrorNote>{error}</ErrorNote>}
              <Button type="submit" size="lg" className="w-full" variant="brand">
                Create account
              </Button>
              <p className="text-center text-xs text-muted">Identity verification is simulated in this prototype.</p>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
