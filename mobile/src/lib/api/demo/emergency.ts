/**
 * Emergency money, simulated: Tier 1 vaults pay at once, Tier 2 after the PIN and the safety
 * pause, within the same guardrails the server checks (monthly cap, requests per week, funds).
 */
import { assertPracticeIdVerified } from "./identity"; // identity
import { emergencyTier } from "../../categories";
import { ApiError } from "../errors";
import type { EmergencyHistoryItem, EmergencyInput, EmergencyOverview, EmergencyPlanItem, EmergencyPreview, EmergencyResult, Guardrail, UploadFile, Vault } from "../types";
import { EMERGENCY_REASONS } from "../types";
import { requirePracticeMpin } from "./mpin"; // mpin
import { practiceAlert } from "./alerts"; // alerts
import { money } from "../../money"; // alerts
import { assertPracticeDeviceCap } from "./devices"; // devices
import { submitReceiptProof } from "./proofs";
import { settleDue } from "./settle";
import { applyEmergencyCap, clone, currency, DAY, findVault, newId, recompute, record, S, toMinor, wait } from "./state"; // alerts: currency

/**
 * The order Tier 2 vaults pay in, by category, as the server's TIER2_ORDER (src/lib/emergency.ts):
 * the emergency fund first, the long-term goals last. Within a category, oldest vault first.
 */
const TIER2_ORDER = ["emergency", "custom", "housing", "education", "retirement"];

/** A vault's place in the cascade: Tier 1 (Health) vaults in their own order, then Tier 2 by TIER2_ORDER. */
function cascadeOrder<V extends { category: string }>(vaults: readonly V[], tier: 1 | 2): V[] {
  const inTier = vaults.filter((v) => emergencyTier(v.category) === tier);
  if (tier === 1) return inTier;
  const rank = (c: string) => (TIER2_ORDER.includes(c) ? TIER2_ORDER.indexOf(c) : TIER2_ORDER.length);
  // Array.prototype.sort is stable, so vaults in one category keep their order (oldest first, as listed).
  return [...inTier].sort((a, b) => rank(a.category) - rank(b.category));
}

const tierVaults = (tier: 1 | 2) => cascadeOrder(S.vaults, tier);

/**
 * The server's cascade (planEmergency): Health vaults first (Tier 1), then the others in TIER2_ORDER,
 * each giving what it has available until the amount is covered. Pure; the contract vectors in
 * tests/contract/vectors/emergency-tiers.json hold both copies to the same answers.
 */
export function planCascade(vaults: readonly Pick<Vault, "id" | "name" | "category" | "available">[], amount: number) {
  const items: EmergencyPlanItem[] = [];
  let left = amount;
  for (const tier of [1, 2] as const) {
    for (const v of cascadeOrder(vaults, tier)) {
      if (left <= 0) break;
      const take = Math.min(left, Math.max(0, v.available));
      if (take > 0) {
        items.push({ vaultId: v.id, vaultName: v.name, category: v.category, amount: take, tier, settled: false });
        left -= take;
      }
    }
  }
  const sum = (tier: 1 | 2) => items.filter((i) => i.tier === tier).reduce((s, i) => s + i.amount, 0);
  return { items, tier1: sum(1), tier2: sum(2), shortfall: Math.max(0, left) };
}

/** Releases Tier 2 payouts whose safety pause is over and keeps the weekly count current. */
export function refreshEmergency() {
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
  const { items, tier1, tier2, shortfall: left } = planCascade(S.vaults, amount);
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
    // mpin: every tier needs the MPIN (the server says so while MPIN_ENFORCED is on).
    needsPin: true,
    needsNote: repeat,
    coolingOff: false,
    releaseEstimate: tier2 > 0 ? `in ${e.rules.tier2HoldSeconds} seconds` : "instantly",
    checks,
    blocked: overCap || tooMany || left > 0,
    risk: { score: 7, features: [] },
  };
}

const slim = (v: Vault) => ({ id: v.id, name: v.name, category: v.category, available: v.available });

export const emergencyApi = {
  emergency: async (): Promise<EmergencyOverview> => {
    await wait(200);
    settleDue();
    refreshEmergency();
    const tier1 = tierVaults(1);
    const tier2 = tierVaults(2);
    return {
      ...clone(S.emergency),
      tier1Available: tier1.reduce((s, v) => s + v.available, 0),
      tier2Available: tier2.reduce((s, v) => s + v.available, 0),
      healthVaults: tier1.map(slim),
      tier2Vaults: tier2.map(slim),
    };
  },
  emergencyPreview: async (amountMajor: number) => {
    await wait(250);
    return plan(toMinor(amountMajor));
  },
  emergencyWithdraw: async (input: EmergencyInput): Promise<EmergencyResult> => {
    assertPracticeIdVerified(); // identity: a verified ID first, as on the server (and read-only while a recovery request waits)
    await wait(700);
    assertPracticeDeviceCap(toMinor(input.amount)); // devices: the amount asked for, before the MPIN (as on the server)
    // mpin: every tier needs the MPIN, checked before anything moves (as on the server).
    requirePracticeMpin(input.pin);
    const p = plan(toMinor(input.amount));
    if (p.blocked) return { id: newId("emg"), status: "blocked", plan: p };
    if (!input.attest) throw new ApiError("Confirm this is a genuine emergency", 400);
    if (p.needsNote && (input.note ?? "").trim().length < 10) throw new ApiError("Add a short description of what happened", 400);
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
      id: newId("emg"),
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
    practiceAlert("money_out", "Emergency money sent", `${money(p.amount, currency)} ${tier2 ? "is on its way" : "went"} to your bank from your vaults.`); // alerts
    // The whole plan, as the server answers, with the items as they moved.
    return { id: item.id, status: tier2 ? "processing" : "released", plan: { ...p, items: item.plan }, releaseAt, receiptRequired: true };
  },
  emergencyReceipt: async (emergencyId: string, file: UploadFile) => {
    await wait(500);
    const item = S.emergency.history.find((h) => h.id === emergencyId);
    if (!item) throw new ApiError("Emergency request not found", 404);
    if (!["requested", "optional", "overdue", "rejected"].includes(item.receiptStatus)) throw new ApiError("A receipt is already being processed", 409);
    return submitReceiptProof(item, file);
  },
};
