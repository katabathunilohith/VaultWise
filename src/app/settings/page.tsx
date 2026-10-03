"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Globe, KeyRound, RotateCcw, Scale, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { api, clearApiCache, refreshAll } from "@/lib/client";
import { fmtMoney } from "@/lib/shared";
import { useMe } from "@/components/shell";
import { Badge, Button, Card, CardTitle, ErrorNote, Field, Input, KV, PageHeader, Select, useToast } from "@/components/ui";

export default function SettingsPage() {
  const { user, rules, jurisdictions, aiEnabled, reload } = useMe();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? "");
  const [pin, setPin] = useState("");
  const [jur, setJur] = useState(user.jurisdiction);
  const [year, setYear] = useState(new Date().getFullYear());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const save = async (key: string, body: Record<string, unknown>, msg: string) => {
    setBusy(key);
    setErr(null);
    try {
      await api.patch("/api/v1/me", body);
      toast({ tone: "good", text: msg });
      reload();
      refreshAll();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="vw-in">
      <PageHeader title="Settings & privacy" subtitle="Your profile, security, market rules and data rights." />
      {err && (
        <div className="mb-4">
          <ErrorNote>{err}</ErrorNote>
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <UserRound className="size-4" /> Profile
            </span>
          </CardTitle>
          <div className="space-y-4">
            <Field label="Full name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <div className="flex items-center justify-between">
              <Badge tone="good">
                KYC level {user.kycLevel} · {user.kycStatus}
              </Badge>
              <Button loading={busy === "profile"} onClick={() => save("profile", { name, email }, "Profile saved.")}>
                Save
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle sub="Required for Tier 2 emergency access">
            <span className="inline-flex items-center gap-2">
              <KeyRound className="size-4" /> Security PIN
            </span>
          </CardTitle>
          <div className="flex items-end gap-3">
            <Field label="New PIN (4–6 digits)">
              <Input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                maxLength={6}
                autoComplete="new-password"
              />
            </Field>
            <Button
              disabled={pin.length < 4}
              loading={busy === "pin"}
              onClick={async () => {
                await save("pin", { pin }, "PIN updated.");
                setPin("");
              }}
            >
              Update
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted">
            PINs are stored as salted scrypt hashes. Biometric step-up and device attestation would replace this on mobile.
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle
            sub="One codebase, per-market rules: the compliance engine switches limits, permitted products and disclosures. Illustrative values — not legal advice."
            action={
              <div className="flex items-center gap-2">
                <Select value={jur} onChange={(e) => setJur(e.target.value)} className="h-9 w-auto">
                  {jurisdictions.map((j) => (
                    <option key={j.code} value={j.code}>
                      {j.flag} {j.name}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  disabled={jur === user.jurisdiction}
                  loading={busy === "jur"}
                  onClick={() => save("jur", { jurisdiction: jur }, "Market rules updated.")}
                >
                  Apply
                </Button>
              </div>
            }
          >
            <span className="inline-flex items-center gap-2">
              <Globe className="size-4" /> Market &amp; compliance rules · {rules.flag} {rules.name}
            </span>
          </CardTitle>
          {jur !== user.jurisdiction && (
            <p className="mb-4 text-xs text-warn-ink">
              Your wallet currency ({user.currency}) is fixed at onboarding; switching market changes rules and disclosures only.
            </p>
          )}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Licensing route</div>
              <div className="divide-y divide-line text-[13px]">
                <KV k="E-money" v={<span className="text-xs">{rules.emoneyRegime}</span>} />
                <KV k="Investing" v={<span className="text-xs">{rules.investRegime}</span>} />
                <KV k="Crypto" v={<span className="text-xs">{rules.cryptoRegime}</span>} />
                <KV k="Data protection" v={<span className="text-xs">{rules.dataRegime}</span>} />
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Emergency guardrails</div>
              <div className="divide-y divide-line text-[13px]">
                <KV k="Monthly cap" v={fmtMoney(rules.emergency.monthlyCap, rules.currency, { decimals: false })} />
                <KV k="Max requests / 7 days" v={rules.emergency.maxRequestsPer7d} />
                <KV k="Cooling-off" v={`${rules.emergency.cooloffHours}h after ${rules.emergency.cooloffAfterRequestsIn72h} in 72h`} />
                <KV k="Tier 2 hold" v={`${rules.emergency.tier2HoldSeconds}s`} />
                <KV k="Receipt window" v={`${rules.emergency.receiptWindowDays} days`} />
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Verification & investing</div>
              <div className="divide-y divide-line text-[13px]">
                <KV k="Auto-approve at" v={`≥ ${rules.verification.autoApprove * 100}%`} />
                <KV k="Auto-decline at" v={`≤ ${rules.verification.autoDeny * 100}%`} />
                <KV k="Max document age" v={`${rules.verification.maxDocAgeDays} days`} />
                <KV k="Satellite cap" v={`${rules.satellite.maxAllocationPct}% · ${rules.satellite.assetClasses.join(", ")}`} />
                <KV k="Cooling-off on investments" v={rules.coolingOffDays ? `${rules.coolingOffDays} days` : "—"} />
              </div>
            </div>
          </div>
          <div className="mt-5 rounded-xl bg-surface-2 p-4">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
              <Scale className="size-4" /> Disclosures shown in this market
            </div>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">
              {rules.disclosures.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        </Card>

        <Card>
          <CardTitle sub={`Your rights under ${rules.dataRegime}`}>Your data</CardTitle>
          <div className="space-y-3">
            <a href="/api/v1/me/export" className="flex items-center gap-3 rounded-xl border border-line p-3 transition-colors hover:border-accent">
              <Download className="size-5 text-accent" />
              <div className="flex-1">
                <div className="text-sm font-medium">Download all my data</div>
                <div className="text-xs text-muted">Profile, ledger, proofs metadata and audit log as JSON</div>
              </div>
            </a>
            <div className="flex items-center gap-3 rounded-xl border border-line p-3">
              <FileSpreadsheet className="size-5 text-accent" />
              <div className="flex-1">
                <div className="text-sm font-medium">Tax summary</div>
                <div className="text-xs text-muted">Contributions, withdrawals and cost basis as CSV</div>
              </div>
              <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-8 w-24 text-[13px]">
                {[0, 1].map((k) => (
                  <option key={k} value={new Date().getFullYear() - k}>
                    {new Date().getFullYear() - k}
                  </option>
                ))}
              </Select>
              <a href={`/api/v1/reports/tax?year=${year}`} className="text-[13px] font-medium text-accent-ink hover:underline">
                Export
              </a>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle sub="Prototype controls">System</CardTitle>
          <div className="divide-y divide-line text-[13px]">
            <KV k="AI provider" v={aiEnabled ? <Badge tone="good">Groq connected</Badge> : <Badge tone="warn">No API key</Badge>} />
            <KV k="Document model" v={<span className="font-mono text-xs">qwen/qwen3.8-27b</span>} />
            <KV k="Assistant model" v={<span className="font-mono text-xs">openai/gpt-oss-120b</span>} />
            <KV k="Market data" v="Yahoo Finance (cached)" />
          </div>
          <div className="mt-4 rounded-xl border border-bad/30 p-4">
            <div className="text-sm font-medium">Reset demo</div>
            <p className="mt-1 text-xs text-muted">Deletes the local database and uploaded proofs, then returns to onboarding.</p>
            <Button
              variant="danger"
              size="sm"
              className="mt-3"
              icon={<RotateCcw className="size-3.5" />}
              loading={busy === "reset"}
              onClick={async () => {
                if (!confirm("Delete all local data and start over?")) return;
                setBusy("reset");
                await api.post("/api/v1/reset");
                clearApiCache();
                router.push("/");
                reload();
              }}
            >
              Reset everything
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
