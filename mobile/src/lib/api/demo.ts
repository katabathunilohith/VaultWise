/**
 * Demo mode: the same API surface as the live server, backed by a snapshot of real
 * responses (src/data/fixtures) and simulations of the parts that move — deposits, the proof
 * pipeline, the emergency cascade and Pay with Vaultwise. It mirrors the server's rules where
 * they matter to the UI (one proof per withdrawal, Tier 2 safety pause, weekly request limit).
 * State lives in memory and resets when the app restarts or on reset().
 */
import accountsFx from "@/data/fixtures/accounts.json";
import activityFx from "@/data/fixtures/activity.json";
import badgesFx from "@/data/fixtures/badges.json";
import dashboardFx from "@/data/fixtures/dashboard.json";
import emergencyFx from "@/data/fixtures/emergency.json";
import coreFx from "@/data/fixtures/invest-core.json";
import satelliteFx from "@/data/fixtures/invest-satellite.json";
import insightFx from "@/data/fixtures/insight.json";
import limitsFx from "@/data/fixtures/limits.json";
import meFx from "@/data/fixtures/me.json";
import portfolioFx from "@/data/fixtures/portfolio.json";
import detailFx from "@/data/fixtures/vault-detail.json";
import vaultsFx from "@/data/fixtures/vaults.json";

import { money } from "../money";
import { ApiError } from "./errors";
import type { PaymentIntent } from "./pay-types";
import { DEMO_SAMPLES } from "./samples";
import type {
  Accounts,
  Activity,
  BadgesResponse,
  CreateVaultInput,
  Dashboard,
  EmergencyHistoryItem,
  EmergencyInput,
  EmergencyOverview,
  EmergencyPlanItem,
  EmergencyPreview,
  EmergencyResult,
  Guardrail,
  Insight,
  InvestCore,
  JournalLine,
  LimitKey,
  LimitsOverview,
  Me,
  MeOnboarded,
  OnboardingInput,
  Portfolio,
  ProofView,
  Stage,
  StageStatus,
  UpdateVaultInput,
  UploadFile,
  Vault,
  VaultCategory,
  VaultDetail,
  WithdrawalRow,
} from "./types";
import { EMERGENCY_REASONS } from "./types";

/** The PIN demo mode accepts, so both the right- and wrong-PIN paths can be tried. */
export const DEMO_PIN = "1234";

const DAY = 86_400_000;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const id = (prefix: string) => `${prefix}_demo${Math.random().toString(36).slice(2, 10)}`;
const toMinor = (major: number) => Math.round(major * 100);
const PERIOD: Record<string, number> = { weekly: 7 * DAY, biweekly: 14 * DAY, monthly: 30 * DAY };

type Journal = Activity["journals"][number];
type Recent = Dashboard["recent"][number];

/* ---------- state ---------- */

interface State {
  me: MeOnboarded;
  vaults: Vault[];
  histories: Map<string, JournalLine[]>;
  withdrawals: Map<string, WithdrawalRow[]>;
  totals: Dashboard["totals"];
  emergency: EmergencyOverview;
  limits: LimitsOverview;
  journals: Journal[];
  recent: Recent[];
}

function fresh(): State {
  const detail = detailFx as unknown as VaultDetail;
  const activity = activityFx as unknown as Activity;
  const dash = dashboardFx as unknown as Dashboard;
  return {
    me: clone(meFx) as unknown as MeOnboarded,
    vaults: clone((vaultsFx as { vaults: Vault[] }).vaults),
    histories: new Map([[detail.vault.id, clone(detail.history)]]),
    withdrawals: new Map([[detail.vault.id, clone(detail.withdrawals)]]),
    totals: clone(dash.totals),
    emergency: clone(emergencyFx) as unknown as EmergencyOverview,
    limits: clone(limitsFx) as unknown as LimitsOverview,
    journals: clone(activity.journals),
    recent: clone(dash.recent),
  };
}

let S = fresh();
const currency = S.me.user.currency;

function recompute(v: Vault) {
  v.available = Math.max(0, v.balance - v.held);
  v.progress = v.target > 0 ? Math.min(1, v.balance / v.target) : 0;
  if (v.targetDate) {
    const months = Math.max(1, (new Date(v.targetDate).getTime() - Date.now()) / (30 * DAY));
    v.monthlyNeeded = Math.max(0, Math.round((v.target - v.balance) / months));
  }
}

function findVault(vaultId: string) {
  const v = S.vaults.find((x) => x.id === vaultId);
  if (!v) throw new ApiError("Vault not found", 404);
  return v;
}

/**
 * Records a money movement everywhere the UI reads it: the vault's history, the activity feed
 * and the dashboard's recent list (unsigned amounts there, as the server returns them).
 */
function record(kind: string, memo: string, vault: Vault | null, vaultDelta: number, counterparty: { account: string; kind: string }) {
  const now = Date.now();
  const jid = id("jnl");
  if (vault) {
    const list = S.histories.get(vault.id) ?? [];
    list.unshift({ journal_id: jid, kind, memo, created_at: now, amount: vaultDelta, currency, ref_type: "vault", ref_id: vault.id });
    S.histories.set(vault.id, list);
  }
  journal(jid, kind, memo, now, [
    ...(vault ? [{ account: `Vault · ${vault.name}`, kind: "vault", amount: vaultDelta }] : []),
    { account: counterparty.account, kind: counterparty.kind, amount: -vaultDelta },
  ]);
}

/** Adds a journal to the activity feed and the dashboard's recent list. */
function journal(jid: string, kind: string, memo: string, at: number, entries: Journal["entries"]) {
  S.journals.unshift({ id: jid, kind, memo, created_at: at, entries });
  S.recent.unshift({ id: jid, kind, memo, created_at: at, amount: Math.max(0, ...entries.map((e) => Math.abs(e.amount))) });
  S.recent = S.recent.slice(0, 12);
}

/** The server's "today": withdrawals since local midnight count toward the daily limit. */
function startOfToday(now = Date.now()) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Same rule as the server: requests made today that weren't declined, cancelled or expired. */
function withdrawnToday() {
  const since = startOfToday();
  return [...S.withdrawals.values()]
    .flat()
    .filter((w) => w.created_at >= since && w.status !== "denied" && w.status !== "cancelled" && w.status !== "expired")
    .reduce((s, w) => s + w.amount, 0);
}

/** The emergency cap actually applied: the stricter of the market cap and the personal limit. */
function applyEmergencyCap() {
  const cap = Math.min(S.emergency.marketCap, S.limits.limits.monthlyEmergency);
  S.emergency = { ...S.emergency, cap, remainingCap: Math.max(0, cap - S.emergency.usedThisMonth) };
}

function limitsView(): LimitsOverview {
  const today = withdrawnToday();
  return clone({ ...S.limits, usage: { withdrawnToday: today, dailyRemaining: Math.max(0, S.limits.limits.dailyWithdrawal - today) } });
}

/** Withdrawal statuses the server counts as waiting on a check or a person (and keeps held). */
const PENDING_REVIEW = new Set(["verifying", "in_review", "appealed"]);

const resetListeners = new Set<() => void>();

/**
 * Runs `fn` whenever the demo data is wiped (Settings → Delete account in Practice), so state kept
 * outside this file for demo mode, such as the Invest overlay, can start over with it.
 */
export function subscribeDemoReset(fn: () => void) {
  resetListeners.add(fn);
  return () => {
    resetListeners.delete(fn);
  };
}

/* ---------- proof pipeline simulation ---------- */

type Outcome = "approved" | "purpose" | "edited" | "review";
interface DemoProof {
  id: string;
  createdAt: number;
  outcome: Outcome;
  vaultId: string | null;
  withdrawalId: string | null;
  emergencyId: string | null;
  amount: number;
  fileName: string | null;
  category: string;
  settled: boolean;
  queuedAt: number | null;
  /** A declined check the customer asked a person to look at again, with their note. */
  appealed: boolean;
  appealNote: string | null;
  /** Plain reason when the outcome depends on the vault (e.g. a bill for another purpose). */
  reason?: string;
  /** What the purpose check found, when it handed the bill to a person for a reason other than its age. */
  warnText?: string;
}
const proofs = new Map<string, DemoProof>();

const STAGES: { key: string; name: string; ms: number }[] = [
  { key: "intake", name: "Upload & integrity", ms: 450 },
  { key: "preprocess", name: "Pre-processing & forensics", ms: 700 },
  { key: "extract", name: "OCR & layout understanding", ms: 1200 },
  { key: "classify", name: "Purpose classification", ms: 600 },
  { key: "tamper", name: "Tamper & reuse detection", ms: 750 },
  { key: "decision", name: "Decision & audit trail", ms: 400 },
];
const PIPELINE_MS = STAGES.reduce((s, x) => s + x.ms, 0);

const CATEGORY_WORD: Record<string, string> = {
  health: "medical",
  education: "education",
  housing: "housing",
  emergency: "emergency",
  retirement: "retirement",
};

/**
 * Sample file names drive the demo outcome (the real server reads the document): edited files
 * fail the tamper check, a bill for another purpose fails the purpose check, an old bill goes to
 * a person, and anything else passes.
 */
function outcomeFor(fileName: string, vaultTemplate?: string): { outcome: Outcome; reason?: string } {
  const f = fileName.toLowerCase();
  if (f.includes("tamper")) return { outcome: "edited" };
  const sample = DEMO_SAMPLES.find((x) => f.startsWith(x.key));
  if (f.includes("coffee") || sample?.category === "other") return { outcome: "purpose" };
  if (sample && vaultTemplate && vaultTemplate !== "custom" && vaultTemplate !== "emergency" && sample.category !== vaultTemplate) {
    const word = CATEGORY_WORD[sample.category] ?? sample.category;
    const vaultWord = CATEGORY_WORD[vaultTemplate] ?? vaultTemplate;
    return { outcome: "purpose", reason: `This is a ${word} bill, and this vault only covers ${vaultWord} costs.` };
  }
  if (f.includes("old")) return { outcome: "review" };
  return { outcome: "approved" };
}

function stageStatus(outcome: Outcome, key: string): StageStatus {
  if (outcome === "edited" && key === "tamper") return "failed";
  if (outcome === "purpose" && key === "classify") return "failed";
  if (outcome === "review" && key === "classify") return "warning";
  if ((outcome === "edited" || outcome === "purpose") && key === "decision") return "failed";
  return "passed";
}

const CHECK_TEXT: Record<string, { pass: string; warn?: string; fail?: string }> = {
  intake: { pass: "File type and size are fine. No exact duplicate on file." },
  preprocess: { pass: "Straightened and cleaned. No editing software in the metadata." },
  extract: { pass: "Issuer, date, total and line items read clearly." },
  classify: {
    pass: "The document matches this vault's purpose.",
    warn: "The bill is older than this vault normally accepts, so a person will look at it.",
    fail: "This bill doesn't match what this vault is for.",
  },
  tamper: { pass: "No signs of editing. This document hasn't been used before.", fail: "The total looks edited: the line items don't add up to it." },
  decision: { pass: "Recorded in the audit trail.", fail: "Not approved. You can send a different bill or ask a person to check." },
};

const REASONS: Record<Outcome, string> = {
  approved: "Purpose, amount and date match. No signs of tampering.",
  purpose: "This bill doesn't match what this vault is for.",
  edited: "The total on this document looks edited — the line items don't add up to it.",
  review: "The bill is about ten months old, older than this vault normally accepts, so a person will check it.",
};

function settleProof(p: DemoProof) {
  if (p.settled) return;
  p.settled = true;
  if (p.outcome === "review") p.queuedAt = Date.now();
  if (p.emergencyId) {
    const item = S.emergency.history.find((h) => h.id === p.emergencyId);
    if (item) item.receiptStatus = p.outcome === "approved" ? "verified" : p.outcome === "review" ? "in_review" : "rejected";
    return;
  }
  if (!p.vaultId || !p.withdrawalId) return;
  const v = S.vaults.find((x) => x.id === p.vaultId);
  const w = (S.withdrawals.get(p.vaultId) ?? []).find((x) => x.id === p.withdrawalId);
  if (!v || !w) return;
  w.decided_at = Date.now();
  if (p.outcome === "approved") {
    v.held = Math.max(0, v.held - p.amount);
    v.balance -= p.amount;
    S.totals.bank += p.amount;
    w.status = "paid";
    w.final_decision = "approved";
    w.decision = "auto_approved";
    recompute(v);
    record("withdrawal", `Verified withdrawal · ${w.payee ?? "Payee"}`, v, -p.amount, { account: "Linked bank account", kind: "bank" });
  } else if (p.outcome === "review") {
    // Still held while a person checks.
    w.status = "in_review";
    w.decision = "human_review";
  } else {
    // Declined: the hold is released once, here.
    v.held = Math.max(0, v.held - p.amount);
    w.status = "denied";
    w.final_decision = "denied";
    w.decision = "auto_denied";
    w.decision_reason = p.reason ?? REASONS[p.outcome];
    recompute(v);
  }
}

/**
 * The snapshot's own proofs (the sample vault's earlier withdrawals), already decided. Holding them
 * here lets them be opened, resumed and appealed like this session's, with the same rules.
 */
function seedSnapshotProofs() {
  const detail = detailFx as unknown as VaultDetail;
  for (const w of detail.withdrawals) {
    if (!w.proof_id) continue;
    const outcome: Outcome = w.final_decision === "approved" ? "approved" : w.final_decision === "denied" ? "purpose" : "review";
    proofs.set(w.proof_id, {
      id: w.proof_id,
      createdAt: w.created_at,
      outcome,
      vaultId: w.vault_id,
      withdrawalId: w.id,
      emergencyId: null,
      amount: w.amount,
      fileName: null,
      category: detail.vault.template,
      settled: true,
      queuedAt: outcome === "review" ? w.created_at + PIPELINE_MS : null,
      appealed: false,
      appealNote: null,
      reason:
        w.decision_reason ??
        (outcome === "review" ? "Some items on this bill don't clearly match this vault's purpose, so a person will check it." : undefined),
      warnText: outcome === "review" ? "Some items don't clearly match this vault's purpose." : undefined,
    });
  }
}
seedSnapshotProofs();

/** Whether the simulator holds this proof (one sent this session, or one of the snapshot's). */
export function isDemoProof(proofId: string) {
  return proofs.has(proofId);
}

/**
 * The server runs the checks in the background, so a result lands whether or not anyone is
 * watching. Every read that shows balances or statuses settles the proofs whose checks are done,
 * and the Pay with Vaultwise payments whose checks or review are done.
 */
function settleDue() {
  const now = Date.now();
  for (const p of proofs.values()) if (!p.settled && now - p.createdAt >= PIPELINE_MS) settleProof(p);
  settlePayments();
}

function proofView(p: DemoProof): ProofView {
  const elapsed = Date.now() - p.createdAt;
  let t = 0;
  const stages: Stage[] = STAGES.map((s) => {
    const start = t;
    t += s.ms;
    const status: StageStatus = elapsed >= t ? stageStatus(p.outcome, s.key) : elapsed >= start ? "running" : "pending";
    const text = CHECK_TEXT[s.key];
    const detailText = status === "failed" ? text.fail : status === "warning" ? (p.warnText ?? text.warn) : text.pass;
    return {
      key: s.key,
      name: s.name,
      status,
      startedAt: elapsed >= start ? p.createdAt + start : undefined,
      finishedAt: elapsed >= t ? p.createdAt + t : undefined,
      checks:
        status === "pending" || status === "running"
          ? []
          : [{ label: s.name, status: status === "failed" ? "fail" : status === "warning" ? "warn" : "pass", detail: detailText ?? text.pass }],
    };
  });
  const done = elapsed >= PIPELINE_MS;
  if (done) settleProof(p);
  const declined = p.outcome === "edited" || p.outcome === "purpose";
  // An appealed decline is back with a person, as on the server (final decision "appealed").
  const finalDecision = p.appealed ? "appealed" : p.outcome === "approved" ? "approved" : declined ? "denied" : null;
  const decision = p.outcome === "approved" ? "auto_approved" : declined ? "auto_denied" : "human_review";
  const w = p.vaultId ? (S.withdrawals.get(p.vaultId) ?? []).find((x) => x.id === p.withdrawalId) : null;
  const v = p.vaultId ? S.vaults.find((x) => x.id === p.vaultId) : null;
  return {
    id: p.id,
    purpose: p.emergencyId ? "emergency_receipt" : "withdrawal",
    category: p.category,
    fileName: p.fileName,
    createdAt: p.createdAt,
    hasEla: true,
    extracted: done ? { issuer: w?.payee ?? "City General Hospital", total_amount: p.amount / 100, currency, summary: "Itemised invoice" } : null,
    vault: v ? { id: v.id, name: v.name, category: v.category } : null,
    withdrawal: w ? { id: w.id, amount: w.amount, payee: w.payee, status: w.status } : null,
    emergencyId: p.emergencyId,
    verification: {
      status: done ? "complete" : "running",
      stages,
      confidence: done ? (p.outcome === "approved" ? 0.93 : declined ? 0.21 : 0.62) : null,
      decision: done ? decision : null,
      finalDecision: done ? finalDecision : null,
      reasons: done ? [p.reason ?? REASONS[p.outcome]] : [],
      modelVersion: "vw-proof@1.4 · demo simulator",
      reviewer: null,
      reviewerNote: null,
      appealNote: p.appealNote,
      queuedAt: done ? p.queuedAt : null,
      decidedAt: done && p.outcome !== "review" && !p.appealed ? p.createdAt + PIPELINE_MS : null,
      durationMs: done ? PIPELINE_MS : null,
    },
  };
}

/* ---------- emergency ---------- */

const TIER2_CATEGORIES = new Set(["emergency", "housing", "education", "custom", "retirement"]);

function refreshEmergency() {
  const now = Date.now();
  for (const h of S.emergency.history) {
    if (h.status === "processing" && now >= h.releaseAt) {
      h.status = "released";
      h.releasedAt = h.releaseAt;
      h.plan = h.plan.map((p) => ({ ...p, settled: true }));
    }
  }
  const week = S.emergency.history.filter((h) => now - h.createdAt < 7 * DAY).length;
  S.emergency.requestsLast7d = Math.max(S.emergency.requestsLast7d, week);
}

function plan(amount: number): EmergencyPreview {
  settleDue();
  refreshEmergency();
  const tier2Pool = S.vaults.filter((v) => v.category !== "health" && TIER2_CATEGORIES.has(v.category)).sort((a, b) => b.available - a.available);
  const items: EmergencyPlanItem[] = [];
  let left = amount;
  for (const v of S.vaults.filter((x) => x.category === "health")) {
    const take = Math.min(left, v.available);
    if (take > 0) items.push({ vaultId: v.id, vaultName: v.name, category: v.category, amount: take, tier: 1, settled: false });
    left -= take;
  }
  const tier1 = amount - left;
  for (const v of tier2Pool) {
    if (left <= 0) break;
    const take = Math.min(left, v.available);
    if (take > 0) items.push({ vaultId: v.id, vaultName: v.name, category: v.category, amount: take, tier: 2, settled: false });
    left -= take;
  }
  const tier2 = amount - tier1 - left;
  const e = S.emergency;
  const overCap = amount > e.remainingCap;
  const tooMany = e.requestsLast7d >= e.rules.maxRequestsPer7d;
  const repeat = e.history.some((h) => Date.now() - h.createdAt < 30 * DAY);
  const checks: Guardrail[] = [
    { key: "cap", label: "Monthly emergency cap", status: overCap ? "fail" : "pass", detail: overCap ? "This is more than you have left this month" : "Within this month's emergency cap" },
    {
      key: "frequency",
      label: "Requests this week",
      status: tooMany ? "fail" : "pass",
      detail: `${e.requestsLast7d} of ${e.rules.maxRequestsPer7d} used`,
    },
    { key: "cooloff", label: "Cooling-off", status: "pass", detail: "No recent repeat use" },
    { key: "funds", label: "Money available", status: left > 0 ? "fail" : "pass", detail: left > 0 ? "Your vaults can't cover all of this" : "Covered by your vaults" },
    { key: "risk", label: "Risk check", status: "pass", detail: "Nothing unusual" },
  ];
  return {
    amount,
    items,
    tier1,
    tier2,
    shortfall: left,
    needsPin: tier2 > 0,
    needsNote: repeat,
    coolingOff: false,
    releaseEstimate: tier2 > 0 ? `in ${e.rules.tier2HoldSeconds} seconds` : "instantly",
    checks,
    blocked: overCap || tooMany || left > 0,
    risk: { score: 7, features: [] },
  };
}

/* ---------- Pay with Vaultwise ---------- */

type PayVault = PaymentIntent["eligibleVaults"][number];

interface DemoIntent extends PaymentIntent {
  confirmedAt?: number;
  outcome?: "succeeded" | "in_review";
}

/**
 * Rough price level per currency (USD = 1): the table the server sizes its own samples with
 * (src/lib/shared.ts), so a sample bill costs about the same in every wallet currency.
 */
const CURRENCY_SCALE: Record<string, number> = { USD: 1, EUR: 0.95, GBP: 0.8, SGD: 1.3, INR: 80, CAD: 1.35, AUD: 1.5, AED: 3.67 };

/** A sample bill's line items, written in USD and sized to `cur`; the total is their sum. */
function bill(cur: string, items: [string, number][]) {
  const scale = CURRENCY_SCALE[cur] ?? 1;
  const lineItems = items.map(([description, usd]) => ({ description, amount: Math.round(usd * scale * 100) }));
  return { currency: cur, lineItems, amount: lineItems.reduce((s, x) => s + x.amount, 0) };
}

/** A batch of sample checkouts in `cur`. Each batch after the first gets its own ids. */
function makeIntents(gen: number, cur: string): DemoIntent[] {
  const now = Date.now();
  const suffix = gen ? `_${gen}` : "";
  const base = { createdAt: now, expiresAt: now + DAY, status: "requires_customer" as const, eligibleVaults: [], simulated: true };
  return [
    {
      ...base,
      ...bill(cur, [
        ["Cardiology consultation", 150],
        ["Electrocardiogram (ECG)", 85],
        ["Comprehensive blood panel", 62.5],
      ]),
      id: `pi_demo_citygeneral${suffix}`,
      merchant: { id: "mer_citygeneral", name: "City General Hospital", category: "health", city: "Outpatient billing" },
      category: "health",
      description: "Outpatient invoice",
      reference: "INV-20995",
      outcome: "succeeded",
    },
    {
      ...base,
      ...bill(cur, [
        ["Organic Chemistry, 9th ed.", 36.125],
        ["Lab notebook (2)", 4.5],
        ["Scientific calculator", 12.5],
      ]),
      id: `pi_demo_westfield${suffix}`,
      merchant: { id: "mer_westfield", name: "Westfield College Bookstore", category: "education", city: "Campus store" },
      category: "education",
      description: "Semester textbooks",
      reference: "WCB-7781",
      outcome: "succeeded",
    },
    {
      ...base,
      ...bill(cur, [
        ["Amoxicillin 500mg", 5.25],
        ["Blood pressure monitor cuff", 6.75],
        ["Energy drinks (6-pack)", 2.75],
      ]),
      id: `pi_demo_greenleaf${suffix}`,
      merchant: { id: "mer_greenleaf", name: "Greenleaf Pharmacy", category: "health", city: "High Street" },
      category: "health",
      description: "Pharmacy basket",
      reference: "GLP-30412",
      outcome: "in_review",
    },
  ];
}

/**
 * The sample checkouts. Handled ones are kept, so a paid (or in-review) checkout keeps its
 * outcome and still explains any money it set aside. A fresh batch with new ids is added only
 * once nothing is left to pay or being paid.
 */
function intentStore(initialCurrency: string) {
  let cur = initialCurrency;
  let gen = 0;
  let list = makeIntents(gen, cur);
  const reset = (nextCurrency = cur) => {
    cur = nextCurrency;
    gen = 0;
    list = makeIntents(gen, cur);
  };
  return {
    find: (intentId: string) => list.find((x) => x.id === intentId),
    list: () => list,
    refill() {
      const now = Date.now();
      const open = list.some((i) => i.status === "processing" || (i.status === "requires_customer" && i.expiresAt > now));
      if (!open) list = [...list, ...makeIntents(++gen, cur)];
    },
    reset,
    /** Sizes the samples for this wallet currency. A different currency starts them over. */
    sizeFor(walletCurrency: string) {
      if (walletCurrency !== cur) reset(walletCurrency);
    },
  };
}
type IntentStore = ReturnType<typeof intentStore>;

/** Demo mode: paid from the practice vaults, whose balances move. */
const demoCheckouts = intentStore(currency);
/** A live session while /pay isn't deployed: checked against the real vaults, and nothing moves. */
const dryRunCheckouts = intentStore(currency);

const PAY_STAGES: { key: string; name: string; ms: number; skipped?: boolean }[] = [
  { key: "intake", name: "Invoice from a registered merchant", ms: 250 },
  { key: "preprocess", name: "Image forensics", ms: 0, skipped: true },
  { key: "extract", name: "Read the merchant's line items", ms: 300 },
  { key: "classify", name: "Purpose matches the vault", ms: 450 },
  { key: "tamper", name: "Not paid before", ms: 300 },
  { key: "decision", name: "Decision & audit trail", ms: 250 },
];
const PAY_MS = PAY_STAGES.reduce((s, x) => s + x.ms, 0);
/** A person's check on a payment sent for review, sped up for Practice (as the Tier 2 pause is). */
const PAY_REVIEW_MS = 90_000;

function coversCategory(v: Vault, category: VaultCategory) {
  return v.category === category || (v.category === "custom" && v.template === category);
}

/** The vaults that can pay a bill in this category, with what each has available now. */
function payVaults(vaults: Vault[], category: VaultCategory): PayVault[] {
  return vaults.filter((v) => coversCategory(v, category)).map((v) => ({ id: v.id, name: v.name, category: v.category, available: v.available }));
}

function payFrom(v: Vault, i: DemoIntent) {
  v.balance -= i.amount;
  recompute(v);
  record("payment", `Paid ${i.merchant.name} · ${i.reference}`, v, -i.amount, { account: i.merchant.name, kind: "world" });
}

/**
 * Moves a confirmed checkout to its outcome once the checks are done. Only demo mode moves money
 * (in the practice vault); a dry run against live vaults changes nothing in them.
 *
 * In demo mode a payment sent to a person is held, then the simulated person approves it after
 * PAY_REVIEW_MS: the hold becomes the payment, as with an approved withdrawal. So no hold is
 * left behind, however many rounds of samples are paid.
 */
function advanceIntent(i: DemoIntent, movesMoney: boolean) {
  if (!i.confirmedAt) return;
  const now = Date.now();
  const v = movesMoney ? S.vaults.find((x) => x.id === i.vaultId) : undefined;
  if (i.status === "processing" && now - i.confirmedAt >= PAY_MS) {
    i.status = i.outcome ?? "succeeded";
    if (v && i.status === "succeeded") payFrom(v, i);
    else if (v) {
      v.held += i.amount;
      recompute(v);
    }
    if (i.status !== "in_review") i.decisionReason = null;
    else if (movesMoney) {
      // Rounded up to the minute, so the time shown is never earlier than the decision.
      const by = new Date(Math.ceil((i.confirmedAt + PAY_MS + PAY_REVIEW_MS) / 60_000) * 60_000);
      const time = by.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
      i.decisionReason = `One item doesn't look like a ${i.category} expense, so a person will check it by ${time}.`;
    } else {
      i.decisionReason = `One item doesn't look like a ${i.category} expense. In a real payment, a person would check it before anything is paid.`;
    }
  }
  if (movesMoney && i.status === "in_review" && now - i.confirmedAt >= PAY_MS + PAY_REVIEW_MS) {
    i.status = "succeeded";
    i.decisionReason = null;
    if (v) {
      v.held = Math.max(0, v.held - i.amount);
      payFrom(v, i);
    }
  }
}

/** The server would finish payments in the background; every read catches the demo up first. */
function settlePayments() {
  for (const i of demoCheckouts.list()) advanceIntent(i, true);
}

function payStages(i: DemoIntent): Stage[] | undefined {
  if (!i.confirmedAt) return undefined;
  const elapsed = Date.now() - i.confirmedAt;
  let t = 0;
  return PAY_STAGES.map((s) => {
    const start = t;
    t += s.ms;
    let status: StageStatus = s.skipped ? "skipped" : elapsed >= t ? "passed" : elapsed >= start ? "running" : "pending";
    if (status === "passed" && s.key === "classify" && i.outcome === "in_review") status = "warning";
    return { key: s.key, name: s.name, status, checks: [] };
  });
}

function intentView(i: DemoIntent, eligibleVaults: PayVault[], extra: Partial<PaymentIntent> = {}): PaymentIntent {
  const stages = payStages(i);
  return { ...i, eligibleVaults, ...(stages ? { stages } : {}), ...extra };
}

/** Demo mode: the practice vaults, read after any payment above so balances are post-payment. */
function demoIntentView(i: DemoIntent): PaymentIntent {
  advanceIntent(i, true);
  return intentView(i, payVaults(S.vaults, i.category));
}

function findIntent(store: IntentStore, intentId: string) {
  const i = store.find(intentId);
  if (!i) throw new ApiError("This payment link has expired or doesn't exist", 404);
  return i;
}

/** A checkout can be confirmed only while it's still waiting and its link hasn't run out. */
function assertPayable(i: DemoIntent) {
  if (i.status !== "requires_customer") throw new ApiError("This payment has already been handled", 409);
  if (Date.now() >= i.expiresAt) throw new ApiError("This payment link has expired. Ask the merchant for a new one.", 409);
}

/**
 * Pay with Vaultwise in a live session while the server's /pay routes don't exist. The sample
 * checkouts are offered against the customer's own vaults (the live client passes them in, with
 * the wallet currency, and the samples are sized to that currency) and checked against their real
 * balances, but nothing is debited or held. Every view is marked `dryRun` so the screens can say so.
 */
export const payDryRun = {
  view(intentId: string, vaults: Vault[], walletCurrency: string): PaymentIntent {
    dryRunCheckouts.sizeFor(walletCurrency);
    const i = findIntent(dryRunCheckouts, intentId);
    advanceIntent(i, false);
    return intentView(i, payVaults(vaults, i.category), { dryRun: true });
  },
  confirm(intentId: string, vaultId: string, pin: string, vaults: Vault[], walletCurrency: string): PaymentIntent {
    dryRunCheckouts.sizeFor(walletCurrency);
    const i = findIntent(dryRunCheckouts, intentId);
    advanceIntent(i, false);
    assertPayable(i);
    if (pin !== DEMO_PIN) throw new ApiError("That PIN isn't right", 403);
    const v = vaults.find((x) => x.id === vaultId);
    if (!v || !coversCategory(v, i.category)) throw new ApiError("This vault can't pay this bill. Pick another one.", 400);
    if (v.available < i.amount) throw new ApiError(`${v.name} doesn't have enough available`, 400);
    i.vaultId = vaultId;
    i.status = "processing";
    i.confirmedAt = Date.now();
    return intentView(i, payVaults(vaults, i.category), { dryRun: true });
  },
  list(vaults: Vault[], walletCurrency: string): PaymentIntent[] {
    dryRunCheckouts.sizeFor(walletCurrency);
    for (const i of dryRunCheckouts.list()) advanceIntent(i, false);
    dryRunCheckouts.refill();
    return dryRunCheckouts.list().map((i) => intentView(i, payVaults(vaults, i.category), { dryRun: true }));
  },
  /** After the live account is wiped, its sample checkouts start over too. */
  reset: () => dryRunCheckouts.reset(),
};

/* ---------- the demo API ---------- */

export const demo = {
  me: async (): Promise<Me> => clone(S.me),
  onboarding: async (input: OnboardingInput) => {
    await wait(900);
    S.me = { ...S.me, user: { ...S.me.user, name: input.name, email: input.email ?? null } };
    return { ok: true as const };
  },
  dashboard: async (): Promise<Dashboard> => {
    await wait(250);
    settleDue();
    refreshEmergency();
    const fx = dashboardFx as unknown as Dashboard;
    const saved = S.vaults.reduce((s, v) => s + v.balance, 0);
    const receiptsDue = S.emergency.history.filter((h) => h.receiptStatus === "requested" || h.receiptStatus === "overdue").length;
    // Same statuses the server's dashboard counts as waiting on a check or a person.
    const reviewPending = [...S.withdrawals.values()].flat().filter((w) => PENDING_REVIEW.has(w.status)).length;
    return {
      ...clone(fx),
      vaults: clone(S.vaults),
      totals: { ...S.totals, saved, netWorth: saved + S.totals.bank + S.totals.invested },
      recent: clone(S.recent),
      emergency: { ...fx.emergency, cap: S.emergency.cap, remainingCap: S.emergency.remainingCap, receiptsDue },
      reviewPending,
    };
  },
  vaults: async () => {
    await wait(200);
    settleDue();
    return { vaults: clone(S.vaults), currency };
  },
  vault: async (vaultId: string): Promise<VaultDetail> => {
    await wait(200);
    settleDue();
    const v = findVault(vaultId);
    const history = S.histories.get(vaultId) ?? [];
    // Only this session's movements are in the history for most vaults (the snapshot has the full
    // ledger for one), so the running balance starts from what the vault held before them. That
    // opening point sits just before the first of them: the simulator doesn't know how the balance
    // got there, so the chart and its label only cover the time it does know.
    const opening = v.balance - history.reduce((s, h) => s + h.amount, 0);
    let bal = opening;
    const moves = [...history].reverse().map((h) => ({ t: h.created_at, balance: (bal += h.amount) }));
    const start = opening !== 0 && moves.length ? [{ t: moves[0].t - 1, balance: opening }] : [];
    const series = [...start, ...moves];
    return {
      vault: clone(v),
      history: clone(history),
      series: series.length ? series : [{ t: v.createdAt, balance: v.balance }],
      withdrawals: clone(S.withdrawals.get(vaultId) ?? []),
      currency,
      userName: S.me.user.name,
    };
  },
  createVault: async (input: CreateVaultInput) => {
    await wait(500);
    const vid = id("vlt");
    const initial = input.initialDeposit ? toMinor(input.initialDeposit) : 0;
    const now = Date.now();
    const ruleType = input.ruleType ?? "none";
    const v: Vault = {
      id: vid,
      name: input.name,
      category: input.category,
      template: input.template ?? input.category,
      target: toMinor(input.target),
      targetDate: input.targetDate ?? null,
      balance: initial,
      held: 0,
      available: initial,
      progress: 0,
      monthlyNeeded: null,
      rule: {
        type: ruleType,
        amount: ruleType === "fixed" && input.ruleAmount ? toMinor(input.ruleAmount) : null,
        percent: ruleType === "percent_income" ? (input.rulePercent ?? 5) : null,
        frequency: ruleType === "fixed" ? (input.ruleFrequency ?? "monthly") : null,
        nextRunAt: ruleType === "fixed" ? now + PERIOD[input.ruleFrequency ?? "monthly"] : null,
      },
      isJoint: !!input.isJoint,
      members: [
        { id: id("mbr"), name: S.me.user.name, role: "owner", contributed: initial },
        ...(input.members ?? []).map((m) => ({ id: id("mbr"), name: m.name, role: "member", contributed: 0 })),
      ],
      status: "locked",
      createdAt: now,
      lastContributionAt: initial ? now : null,
      currency,
    };
    recompute(v);
    S.vaults = [...S.vaults, v];
    if (initial) {
      S.totals.bank -= initial;
      record("deposit", "Opening contribution", v, initial, { account: "Linked bank account", kind: "bank" });
    }
    return { id: vid };
  },
  updateVault: async (vaultId: string, patch: UpdateVaultInput) => {
    await wait(300);
    const v = findVault(vaultId);
    if (patch.name) v.name = patch.name;
    if (patch.target) v.target = toMinor(patch.target);
    if (patch.targetDate !== undefined) v.targetDate = patch.targetDate;
    if (patch.ruleType) {
      v.rule = {
        type: patch.ruleType,
        amount: patch.ruleType === "fixed" && patch.ruleAmount ? toMinor(patch.ruleAmount) : null,
        percent: patch.ruleType === "percent_income" ? (patch.rulePercent ?? 5) : null,
        frequency: patch.ruleType === "fixed" ? (patch.ruleFrequency ?? "monthly") : null,
        nextRunAt: patch.ruleType === "fixed" ? Date.now() + PERIOD[patch.ruleFrequency ?? "monthly"] : null,
      };
    }
    recompute(v);
    return { ok: true as const };
  },
  deposit: async (vaultId: string, amountMajor: number, memo?: string) => {
    await wait(450);
    const v = findVault(vaultId);
    const amount = toMinor(amountMajor);
    if (amount > S.totals.bank) throw new ApiError("Your bank doesn't have enough for that", 400);
    v.balance += amount;
    v.lastContributionAt = Date.now();
    S.totals.bank -= amount;
    recompute(v);
    record("deposit", memo ?? "Added from your bank", v, amount, { account: "Linked bank account", kind: "bank" });
    return { journalId: S.journals[0].id };
  },
  withdraw: async (vaultId: string, amountMajor: number, payee: string, note?: string) => {
    await wait(350);
    settleDue();
    const v = findVault(vaultId);
    const amount = toMinor(amountMajor);
    if (amount > v.available) throw new ApiError("That's more than this vault has available", 400);
    const { singleWithdrawal, dailyWithdrawal } = S.limits.limits;
    if (amount > singleWithdrawal)
      throw new ApiError(`That's above your single-withdrawal limit of ${money(singleWithdrawal, currency)}. You can review your limits in Settings.`, 400);
    const today = withdrawnToday();
    if (today + amount > dailyWithdrawal)
      throw new ApiError(
        `That would take today's withdrawals past your daily limit of ${money(dailyWithdrawal, currency)} (${money(Math.max(0, dailyWithdrawal - today), currency)} left today).`,
        400,
      );
    const wid = id("wdr");
    const row: WithdrawalRow = {
      id: wid,
      vault_id: vaultId,
      amount,
      payee,
      note: note ?? null,
      status: "awaiting_proof",
      proof_id: null,
      decision_reason: null,
      created_at: Date.now(),
      decided_at: null,
      decision: null,
      final_decision: null,
      confidence: null,
    };
    S.withdrawals.set(vaultId, [row, ...(S.withdrawals.get(vaultId) ?? [])]);
    v.held += amount;
    recompute(v);
    return { id: wid, status: "awaiting_proof" };
  },
  cancelWithdrawal: async (withdrawalId: string) => {
    for (const [vaultId, rows] of S.withdrawals) {
      const w = rows.find((x) => x.id === withdrawalId);
      if (w && w.status === "awaiting_proof") {
        w.status = "cancelled";
        const v = findVault(vaultId);
        v.held = Math.max(0, v.held - w.amount);
        recompute(v);
        return { ok: true as const };
      }
    }
    throw new ApiError("Only requests still waiting for proof can be cancelled", 409);
  },
  uploadProof: async (vaultId: string, withdrawalId: string, file: UploadFile) => {
    await wait(600);
    const w = (S.withdrawals.get(vaultId) ?? []).find((x) => x.id === withdrawalId);
    if (!w) throw new ApiError("Withdrawal not found", 404);
    // Same rule as the server: one bill per request.
    if (w.status !== "awaiting_proof") throw new ApiError("This withdrawal already has a proof", 409);
    const pid = id("prf");
    const result = outcomeFor(file.name, findVault(vaultId).template);
    proofs.set(pid, {
      id: pid,
      createdAt: Date.now(),
      outcome: result.outcome,
      reason: result.reason,
      vaultId,
      withdrawalId,
      emergencyId: null,
      amount: w.amount,
      fileName: file.name,
      category: findVault(vaultId).template,
      settled: false,
      queuedAt: null,
      appealed: false,
      appealNote: null,
    });
    // The server's status while the bill is checked; the upload itself answers "processing".
    w.status = "verifying";
    w.proof_id = pid;
    return { id: pid, status: "processing" };
  },
  proof: async (proofId: string): Promise<ProofView> => {
    const p = proofs.get(proofId);
    if (!p) throw new ApiError("Proof not found", 404);
    return proofView(p);
  },
  /** Same rules as the server: only a declined check can go to a person, once, and the money is held again meanwhile. */
  appeal: async (proofId: string, note: string) => {
    await wait(400);
    settleDue();
    const p = proofs.get(proofId);
    if (!p) throw new ApiError("Verification not found", 404);
    if (!p.settled || (p.outcome !== "edited" && p.outcome !== "purpose") || p.appealed)
      throw new ApiError("Only declined verifications can be appealed", 409);
    const text = note.trim();
    if (text.length < 5) throw new ApiError("Add a few more words for the person checking it", 400);
    p.appealed = true;
    p.appealNote = text.slice(0, 500);
    p.queuedAt = Date.now();
    if (p.withdrawalId && p.vaultId) {
      const v = S.vaults.find((x) => x.id === p.vaultId);
      const w = (S.withdrawals.get(p.vaultId) ?? []).find((x) => x.id === p.withdrawalId);
      if (v && w && w.status === "denied") {
        w.status = "appealed";
        w.final_decision = "appealed";
        w.decided_at = null;
        v.held += w.amount;
        recompute(v);
      }
    }
    return { ok: true as const };
  },
  emergency: async (): Promise<EmergencyOverview> => {
    await wait(200);
    settleDue();
    refreshEmergency();
    const health = S.vaults.filter((v) => v.category === "health");
    const tier2 = S.vaults.filter((v) => v.category !== "health" && TIER2_CATEGORIES.has(v.category));
    return {
      ...clone(S.emergency),
      tier1Available: health.reduce((s, v) => s + v.available, 0),
      tier2Available: tier2.reduce((s, v) => s + v.available, 0),
      healthVaults: health.map((v) => ({ id: v.id, name: v.name, category: v.category, available: v.available })),
      tier2Vaults: tier2.map((v) => ({ id: v.id, name: v.name, category: v.category, available: v.available })),
    };
  },
  emergencyPreview: async (amountMajor: number) => {
    await wait(250);
    return plan(toMinor(amountMajor));
  },
  emergencyWithdraw: async (input: EmergencyInput): Promise<EmergencyResult> => {
    await wait(700);
    const p = plan(toMinor(input.amount));
    if (p.blocked) return { id: id("emg"), status: "blocked", plan: p };
    if (!input.attest) throw new ApiError("Confirm this is a genuine emergency", 400);
    if (p.needsNote && (input.note ?? "").trim().length < 10) throw new ApiError("Add a short description of what happened", 400);
    if (p.needsPin && input.pin !== DEMO_PIN) throw new ApiError("That PIN isn't right", 403);
    const now = Date.now();
    for (const item of p.items) {
      const v = findVault(item.vaultId);
      v.balance -= item.amount;
      recompute(v);
      record("emergency", `Emergency Tier ${item.tier} · ${EMERGENCY_REASONS[input.reasonCode] ?? "Emergency"}`, v, -item.amount, {
        account: "Linked bank account",
        kind: "bank",
      });
    }
    S.totals.bank += p.amount;
    const tier2 = p.tier2 > 0;
    const releaseAt = tier2 ? now + S.emergency.rules.tier2HoldSeconds * 1000 : now;
    const item: EmergencyHistoryItem = {
      id: id("emg"),
      amount: p.amount,
      reasonCode: input.reasonCode,
      reason: EMERGENCY_REASONS[input.reasonCode] ?? "Emergency",
      note: input.note ?? null,
      tier: tier2 ? 2 : 1,
      plan: p.items.map((x) => ({ ...x, settled: !tier2 })),
      guardrails: p.checks,
      riskScore: p.risk.score,
      status: tier2 ? "processing" : "released",
      releaseAt,
      releasedAt: tier2 ? null : now,
      receiptStatus: "requested",
      receiptDueAt: now + S.emergency.rules.receiptWindowDays * DAY,
      receiptProofId: null,
      createdAt: now,
    };
    S.emergency = {
      ...S.emergency,
      usedThisMonth: S.emergency.usedThisMonth + p.amount,
      requestsLast7d: S.emergency.requestsLast7d + 1,
      requestsLast72h: S.emergency.requestsLast72h + 1,
      requestsLast30d: S.emergency.requestsLast30d + 1,
      history: [item, ...S.emergency.history],
    };
    applyEmergencyCap();
    return { id: item.id, status: tier2 ? "processing" : "released", plan: item.plan, releaseAt, receiptRequired: true };
  },
  emergencyReceipt: async (emergencyId: string, file: UploadFile) => {
    await wait(500);
    const item = S.emergency.history.find((h) => h.id === emergencyId);
    if (!item) throw new ApiError("Emergency request not found", 404);
    if (!["requested", "optional", "overdue", "rejected"].includes(item.receiptStatus)) throw new ApiError("A receipt is already being processed", 409);
    const pid = id("prf");
    proofs.set(pid, {
      id: pid,
      createdAt: Date.now(),
      outcome: outcomeFor(file.name).outcome,
      vaultId: null,
      withdrawalId: null,
      emergencyId,
      amount: item.amount,
      fileName: file.name,
      category: "emergency",
      settled: false,
      queuedAt: null,
      appealed: false,
      appealNote: null,
    });
    // The server's status while a receipt is checked.
    item.receiptStatus = "submitted";
    item.receiptProofId = pid;
    return { id: pid, status: "processing" };
  },
  limits: async () => {
    settleDue();
    return limitsView();
  },
  setLimits: async (major: Partial<Record<LimitKey, number>>) => {
    await wait(400);
    const next = { ...S.limits.limits };
    let loosening = false;
    for (const [k, v] of Object.entries(major) as [LimitKey, number][]) {
      const m = toMinor(v);
      if (m > S.limits.bounds[k].max) throw new ApiError("That's above the maximum for your country", 400);
      if (m > next[k]) loosening = true;
      next[k] = m;
    }
    if (loosening && !S.limits.quota.available) throw new ApiError("You've already raised a limit this month", 409);
    S.limits = { ...S.limits, limits: next, quota: loosening ? { ...S.limits.quota, used: 1, available: false } : S.limits.quota };
    // A new emergency limit applies straight away, as on the server.
    applyEmergencyCap();
    return { overview: limitsView() };
  },
  portfolio: async () => clone(portfolioFx) as unknown as Portfolio,
  investCore: async () => clone(coreFx) as unknown as InvestCore,
  investSatellite: async () => clone(satelliteFx) as Record<string, unknown>,
  // The Invest screen layers this session's plan changes and buys on top (features/invest/demo-overlay).
  // Like the server, a buy is paid from the bank, and refused when the bank is short.
  buyCore: async (amountMajor: number) => {
    await wait(600);
    const amount = toMinor(amountMajor);
    if (!(amount > 0)) throw new ApiError("Amount must be positive", 400);
    if (amount > S.totals.bank) throw new ApiError("Insufficient funds in Linked bank account", 400);
    S.totals.bank -= amount;
    S.totals.invested += amount;
    journal(id("jnl"), "invest_fund", "Add money to Core sleeve", Date.now(), [
      { account: "Linked bank account", kind: "bank", amount: -amount },
      { account: "Core sleeve cash", kind: "core_cash", amount },
    ]);
    return { fills: [] };
  },
  setSip: async () => {
    await wait(400);
    return { ok: true as const };
  },
  cancelSip: async () => {
    await wait(300);
    return { ok: true as const };
  },
  region: async () => ({ guess: { country: "IN", supported: true, source: "demo", detail: "Demo data is set in India" } }),
  reset: async () => {
    await wait(400);
    S = fresh();
    proofs.clear();
    seedSnapshotProofs();
    demoCheckouts.reset();
    resetListeners.forEach((fn) => fn());
    return { ok: true as const };
  },
  exportUrl: () => "",
  insight: async () => clone(insightFx) as Insight,
  activity: async (): Promise<Activity> => {
    settleDue();
    return { ...(clone(activityFx) as unknown as Activity), journals: clone(S.journals) };
  },
  accounts: async () => clone(accountsFx) as unknown as Accounts,
  simulate: async () => {
    await wait(400);
    return { ok: true as const };
  },
  sweep: async () => {
    await wait(400);
    return { ok: true as const };
  },
  badges: async () => clone(badgesFx) as BadgesResponse,
  samples: async () => ({ samples: DEMO_SAMPLES }),
  sampleUri: (key: string) => key,
  assistant: async (messages: { role: "user" | "assistant"; content: string }[], onDelta: (text: string) => void, signal?: AbortSignal) => {
    const q = messages[messages.length - 1]?.content.toLowerCase() ?? "";
    const health = S.vaults.find((v) => v.category === "health");
    let reply = "I'm running in demo mode, so I can only answer from sample data. Connect to the Vaultwise server for full answers.";
    if (/track|goal|health/.test(q) && health)
      reply = `Your ${health.name} is at ${Math.round(health.progress * 100)}% of its goal. Your monthly rule keeps you close to the pace you need. Bumping it a little would get you there sooner.`;
    else if (/emergenc/.test(q))
      reply =
        "Emergency access pays out from your Health vault first, instantly. If that isn't enough, other vaults chip in after your PIN and a short safety pause. You add a receipt afterwards, so it never blocks the money.";
    else if (/proof|receipt|declin/.test(q))
      reply =
        "Every withdrawal needs a document that matches the vault's purpose. Six checks run in about 4 seconds: the file, the image, the text, the purpose, tampering and reuse. Anything unclear goes to a person instead of being declined.";
    else if (/coming|week|auto|schedul/.test(q))
      reply = "Your scheduled saves and your monthly investment plan are listed under Coming up on Home. Nothing moves without showing up there first.";
    for (const word of reply.split(/(?<= )/)) {
      if (signal?.aborted) return;
      onDelta(word);
      await wait(28);
    }
  },
  checkout: async (intentId: string): Promise<PaymentIntent> => {
    await wait(200);
    settleDue();
    return demoIntentView(findIntent(demoCheckouts, intentId));
  },
  confirmCheckout: async (intentId: string, vaultId: string, pin: string): Promise<PaymentIntent> => {
    await wait(300);
    settleDue();
    const i = findIntent(demoCheckouts, intentId);
    advanceIntent(i, true);
    assertPayable(i);
    if (pin !== DEMO_PIN) throw new ApiError("That PIN isn't right", 403);
    const v = findVault(vaultId);
    if (!coversCategory(v, i.category)) throw new ApiError("This vault can't pay this bill. Pick another one.", 400);
    if (v.available < i.amount) throw new ApiError(`${v.name} doesn't have enough available`, 400);
    i.vaultId = vaultId;
    i.status = "processing";
    i.confirmedAt = Date.now();
    return demoIntentView(i);
  },
  demoIntents: async (): Promise<PaymentIntent[]> => {
    // Catches every checkout up (checks done, reviews finished) before deciding whether to refill.
    settleDue();
    demoCheckouts.refill();
    return demoCheckouts.list().map(demoIntentView);
  },
};
