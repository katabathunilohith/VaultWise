"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { api, refreshAll, useApi } from "@/lib/client";
import { CATEGORIES, CATEGORY_ORDER, fmtMoney, type VaultCategory } from "@/lib/shared";
import { CategoryIcon, VaultCard, type VaultView } from "@/components/vault-bits";
import {
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  Modal,
  MoneyInput,
  Notice,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  Toggle,
  cx,
  useToast,
} from "@/components/ui";
import { useMe } from "@/components/shell";

type Rule = "none" | "fixed" | "percent_income" | "roundup";

function CreateVault({ open, onClose, initialCategory }: { open: boolean; onClose: () => void; initialCategory?: VaultCategory }) {
  const { user } = useMe();
  const router = useRouter();
  const toast = useToast();
  const [category, setCategory] = useState<VaultCategory>(initialCategory ?? "health");
  const [template, setTemplate] = useState<VaultCategory>("custom");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [rule, setRule] = useState<Rule>("fixed");
  const [ruleAmount, setRuleAmount] = useState("100");
  const [rulePercent, setRulePercent] = useState("5");
  const [freq, setFreq] = useState<"weekly" | "biweekly" | "monthly">("monthly");
  const [initial, setInitial] = useState("");
  const [joint, setJoint] = useState(false);
  const [member, setMember] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await api.post<{ id: string }>("/api/v1/vaults", {
        name: name || CATEGORIES[category].label.split(" /")[0] + " fund",
        category,
        template: category === "custom" ? template : undefined,
        target: Number(target),
        targetDate: targetDate || null,
        ruleType: rule,
        ruleAmount: rule === "fixed" ? Number(ruleAmount) : undefined,
        rulePercent: rule === "percent_income" ? Number(rulePercent) : undefined,
        ruleFrequency: rule === "fixed" ? freq : undefined,
        initialDeposit: initial ? Number(initial) : undefined,
        isJoint: joint,
        members: joint && member.trim() ? [{ name: member.trim() }] : undefined,
      });
      toast({ tone: "good", text: "Vault created and locked." });
      refreshAll();
      onClose();
      router.push(`/vaults/${r.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New purpose-locked vault"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!Number(target)}>
            Create vault
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <div className="mb-2 text-[13px] font-medium text-ink-2">Purpose</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cx(
                  "flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors",
                  category === c ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong",
                )}
                aria-pressed={category === c}
              >
                <CategoryIcon category={c} size="sm" />
                <span className="text-[13px] font-medium">{CATEGORIES[c].label}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Withdrawals need: {CATEGORIES[category].proofHint.toLowerCase()}.</p>
        </div>

        {category === "custom" && (
          <Field
            label="Verification template"
            hint="Custom goals borrow the closest template. Without one, every withdrawal gets the strictest review."
          >
            <Select value={template} onChange={(e) => setTemplate(e.target.value as VaultCategory)}>
              <option value="custom">None — strictest tier (always reviewed by a person)</option>
              {CATEGORY_ORDER.filter((c) => c !== "custom").map((c) => (
                <option key={c} value={c}>
                  {CATEGORIES[c].label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                category === "education" ? "Maya's college fund" : "My " + CATEGORIES[category].label.split(" /")[0].toLowerCase() + " fund"
              }
            />
          </Field>
          <Field label="Goal">
            <MoneyInput
              currency={user.currency}
              value={target}
              onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="5,000"
            />
          </Field>
          <Field label="Target date" hint="Optional">
            <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
          </Field>
        </div>

        <div>
          <div className="mb-2 text-[13px] font-medium text-ink-2">Contribution rule</div>
          <Segmented
            value={rule}
            onChange={setRule}
            options={[
              { value: "fixed", label: "Fixed amount" },
              { value: "percent_income", label: "% of income" },
              { value: "roundup", label: "Round-ups" },
              { value: "none", label: "Manual" },
            ]}
          />
          <div className="mt-3">
            {rule === "fixed" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Amount">
                  <MoneyInput currency={user.currency} value={ruleAmount} onChange={(e) => setRuleAmount(e.target.value.replace(/[^\d.]/g, ""))} />
                </Field>
                <Field label="Every">
                  <Select value={freq} onChange={(e) => setFreq(e.target.value as typeof freq)}>
                    <option value="weekly">Week</option>
                    <option value="biweekly">Two weeks</option>
                    <option value="monthly">Month</option>
                  </Select>
                </Field>
              </div>
            )}
            {rule === "percent_income" && (
              <Field label="Share of each detected salary credit" hint="Moves automatically when income lands in your linked account.">
                <Select value={rulePercent} onChange={(e) => setRulePercent(e.target.value)}>
                  {[2, 3, 5, 8, 10, 15, 20].map((p) => (
                    <option key={p} value={p}>
                      {p}%
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {rule === "roundup" && <Notice>Card purchases round up to the next whole unit and the spare change is swept into this vault.</Notice>}
            {rule === "none" && <Notice>You&apos;ll add money yourself. Vaults with a rule are far more likely to reach their goal.</Notice>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Opening deposit" hint="Optional — moved from your linked account">
            <MoneyInput
              currency={user.currency}
              value={initial}
              onChange={(e) => setInitial(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0.00"
            />
          </Field>
          <div className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-[13px] font-medium">
                  <Users className="size-4" /> Joint / family vault
                </div>
                <div className="text-xs text-muted">Save toward a shared goal</div>
              </div>
              <Toggle checked={joint} onChange={setJoint} label="Joint vault" />
            </div>
            {joint && <Input className="mt-3" value={member} onChange={(e) => setMember(e.target.value)} placeholder="Co-saver's name" />}
          </div>
        </div>
        {err && <ErrorNote>{err}</ErrorNote>}
      </div>
    </Modal>
  );
}

export default function VaultsPage() {
  return (
    <Suspense>
      <Vaults />
    </Suspense>
  );
}

function Vaults() {
  const { data } = useApi<{ vaults: VaultView[]; currency: string }>("/api/v1/vaults");
  const router = useRouter();
  const requested = useSearchParams().get("new");
  const [manual, setManual] = useState<{ open: boolean; category?: VaultCategory }>({ open: false });
  // "?new=1" or "?new=health" opens the dialog (links from the dashboard and nudges).
  const open = manual.open || !!requested;
  const initialCat = manual.category ?? (requested && requested in CATEGORIES ? (requested as VaultCategory) : undefined);
  const setOpen = (v: boolean) => {
    setManual({ open: v });
    if (!v && requested) router.replace("/vaults");
  };

  const total = data?.vaults.reduce((s, v) => s + v.balance, 0) ?? 0;
  const target = data?.vaults.reduce((s, v) => s + v.target, 0) ?? 0;

  return (
    <div className="vw-in">
      <PageHeader
        title="Vaults"
        subtitle="Each vault is its own sub-ledger. Money is locked by default and released only against matching, verified proof — or through emergency access."
        actions={
          <Button variant="brand" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
            New vault
          </Button>
        }
      />
      {data && data.vaults.length > 0 && (
        <Card className="mb-5 flex flex-wrap items-center gap-x-10 gap-y-3">
          <div>
            <div className="text-[13px] text-muted">Total in vaults</div>
            <div className="tnum text-2xl font-semibold">{fmtMoney(total, data.currency)}</div>
          </div>
          <div>
            <div className="text-[13px] text-muted">Combined goals</div>
            <div className="tnum text-2xl font-semibold">{fmtMoney(target, data.currency, { decimals: false })}</div>
          </div>
          <div>
            <div className="text-[13px] text-muted">Vaults</div>
            <div className="tnum text-2xl font-semibold">{data.vaults.length}</div>
          </div>
        </Card>
      )}
      {!data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((k) => (
            <Skeleton key={k} className="h-52" />
          ))}
        </div>
      ) : data.vaults.length === 0 ? (
        <Empty
          title="No vaults yet"
          body="Start with a Health vault — it's the first stop in an emergency and releases instantly."
          action={<Button onClick={() => setManual({ open: true, category: "health" })}>Create a Health vault</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.vaults.map((v) => (
            <VaultCard key={v.id} v={v} />
          ))}
        </div>
      )}
      <CreateVault key={initialCat ?? "default"} open={open} onClose={() => setOpen(false)} initialCategory={initialCat} />
    </div>
  );
}
