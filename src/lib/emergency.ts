import { all, get, newId, parseJson, run, tx } from "./db";
import { audit } from "./audit";
import { rulesFor } from "./compliance";
import { emergencyRiskScore, raiseFlag } from "./fraud";
import { transfer, userAccount } from "./ledger";
import { checkPin, HttpError, type User } from "./users";
import { effectiveEmergencyCap } from "./limits";
import { listVaults, type VaultView } from "./vaults";
import { EMERGENCY_REASONS, fmtMoney, type VaultCategory } from "./shared";

/**
 * Tiered emergency cascade.
 *  Tier 1 — Health vault: one attestation, instant, no document.
 *  Tier 2 — only once Health is exhausted: PIN + reason code, short hold.
 * Guardrails (monthly cap, velocity, cooling-off on repeat use, risk flagging)
 * are part of the feature, not an afterthought.
 */

const TIER2_ORDER: VaultCategory[] = ["emergency", "custom", "housing", "education", "retirement"];
const DAY = 86_400_000;

export interface PlanItem {
  vaultId: string;
  vaultName: string;
  category: VaultCategory;
  amount: number;
  tier: 1 | 2;
  settled: boolean;
}

export interface GuardrailCheck {
  key: string;
  label: string;
  status: "pass" | "warn" | "block";
  detail: string;
}

export interface EmergencyRequestRow {
  id: string;
  user_id: string;
  amount: number;
  reason_code: string;
  note: string | null;
  tier: number;
  plan: string;
  guardrails: string;
  risk_score: number;
  status: "released" | "processing" | "cooling_off" | "blocked";
  release_at: number | null;
  released_at: number | null;
  receipt_status: string;
  receipt_due_at: number | null;
  receipt_proof_id: string | null;
  created_at: number;
}

function monthStart(now: number) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function emergencyStatus(user: User, now = Date.now()) {
  const rules = rulesFor(user.jurisdiction).emergency;
  // The stricter of the market's cap and the customer's own monthly limit.
  const cap = effectiveEmergencyCap(user);
  const usedThisMonth =
    get<{ s: number }>(
      "SELECT COALESCE(SUM(amount), 0) AS s FROM emergency_requests WHERE user_id = ? AND status != 'blocked' AND created_at >= ?",
      user.id,
      monthStart(now),
    )?.s ?? 0;
  const last7 = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM emergency_requests WHERE user_id = ? AND status != 'blocked' AND created_at > ?",
    user.id,
    now - 7 * DAY,
  )!.n;
  const last72h = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM emergency_requests WHERE user_id = ? AND status != 'blocked' AND created_at > ?",
    user.id,
    now - 3 * DAY,
  )!.n;
  const last30 = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM emergency_requests WHERE user_id = ? AND status != 'blocked' AND created_at > ?",
    user.id,
    now - 30 * DAY,
  )!.n;
  const vaults = listVaults(user);
  const health = vaults.filter((v) => v.category === "health");
  const others = TIER2_ORDER.flatMap((c) => vaults.filter((v) => v.category === c));
  const history = all<EmergencyRequestRow>("SELECT * FROM emergency_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", user.id).map(
    viewRequest,
  );
  return {
    rules,
    cap,
    marketCap: rules.monthlyCap,
    usedThisMonth,
    remainingCap: Math.max(0, cap - usedThisMonth),
    requestsLast7d: last7,
    requestsLast72h: last72h,
    requestsLast30d: last30,
    friction: frictionLevel(last30, last72h, rules),
    tier1Available: health.reduce((s, v) => s + Math.max(0, v.available), 0),
    tier2Available: others.reduce((s, v) => s + Math.max(0, v.available), 0),
    healthVaults: health.map(slim),
    tier2Vaults: others.map(slim),
    history,
  };
}

function slim(v: VaultView) {
  return { id: v.id, name: v.name, category: v.category, available: Math.max(0, v.available) };
}

function frictionLevel(last30: number, last72h: number, rules: ReturnType<typeof rulesFor>["emergency"]) {
  if (last72h >= rules.cooloffAfterRequestsIn72h)
    return { level: 3, label: "Cooling-off", detail: `Repeat use within 72 hours — releases wait ${rules.cooloffHours}h` };
  if (last30 >= 1) return { level: 2, label: "Elevated", detail: "Repeat use this month — a short description is required" };
  return { level: 1, label: "Standard", detail: "Fastest path — Tier 1 needs only your attestation" };
}

export function planEmergency(user: User, amount: number, now = Date.now()) {
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, "Enter an amount");
  const status = emergencyStatus(user, now);
  const rules = status.rules;
  const items: PlanItem[] = [];
  let remaining = amount;
  for (const v of status.healthVaults) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, v.available);
    if (take > 0) {
      items.push({ vaultId: v.id, vaultName: v.name, category: v.category, amount: take, tier: 1, settled: false });
      remaining -= take;
    }
  }
  for (const v of status.tier2Vaults) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, v.available);
    if (take > 0) {
      items.push({ vaultId: v.id, vaultName: v.name, category: v.category, amount: take, tier: 2, settled: false });
      remaining -= take;
    }
  }
  const tier1 = items.filter((i) => i.tier === 1).reduce((s, i) => s + i.amount, 0);
  const tier2 = items.filter((i) => i.tier === 2).reduce((s, i) => s + i.amount, 0);
  const risk = emergencyRiskScore(user.id, amount, now);

  const checks: GuardrailCheck[] = [];
  checks.push(
    amount <= status.remainingCap
      ? {
          key: "cap",
          label: "Monthly emergency cap",
          status: "pass",
          detail: `${fmtMoney(status.usedThisMonth + amount, user.currency)} of ${fmtMoney(status.cap, user.currency)} this month`,
        }
      : {
          key: "cap",
          label: "Monthly emergency cap",
          status: "block",
          detail: `Only ${fmtMoney(status.remainingCap, user.currency)} left of this month's ${fmtMoney(status.cap, user.currency)} ${status.cap < status.marketCap ? "personal limit" : "cap"}`,
        },
  );
  checks.push(
    status.requestsLast7d < rules.maxRequestsPer7d
      ? {
          key: "velocity",
          label: "Velocity limit",
          status: "pass",
          detail: `${status.requestsLast7d} of ${rules.maxRequestsPer7d} requests used in the last 7 days`,
        }
      : { key: "velocity", label: "Velocity limit", status: "block", detail: `${rules.maxRequestsPer7d} emergency requests already made in 7 days` },
  );
  checks.push(
    remaining <= 0
      ? {
          key: "funds",
          label: "Funds available",
          status: "pass",
          detail: tier2 > 0 ? "Health vault exhausted — remainder cascades to other vaults" : "Covered by your Health vault",
        }
      : { key: "funds", label: "Funds available", status: "block", detail: `Short by ${fmtMoney(remaining, user.currency)} across all vaults` },
  );
  checks.push(
    status.friction.level === 3
      ? { key: "cooloff", label: "Repeat-use friction", status: "warn", detail: status.friction.detail }
      : status.friction.level === 2
        ? { key: "cooloff", label: "Repeat-use friction", status: "warn", detail: status.friction.detail }
        : { key: "cooloff", label: "Repeat-use friction", status: "pass", detail: "No recent emergency use" },
  );
  checks.push({
    key: "risk",
    label: "Risk engine",
    status: risk.score >= 60 ? "warn" : "pass",
    detail: risk.score >= 60 ? `Score ${risk.score}/100 — will be flagged for pattern review (doesn't block)` : `Score ${risk.score}/100`,
  });

  const blocked = checks.some((c) => c.status === "block");
  return {
    amount,
    items,
    tier1,
    tier2,
    shortfall: Math.max(0, remaining),
    needsPin: tier2 > 0,
    needsNote: status.friction.level >= 2,
    coolingOff: status.friction.level === 3,
    releaseEstimate:
      status.friction.level === 3
        ? `in ${rules.cooloffHours} hours`
        : tier2 > 0
          ? tier1 > 0
            ? "Tier 1 now, Tier 2 within minutes"
            : "within minutes"
          : "instantly",
    checks,
    blocked,
    risk,
  };
}

export function executeEmergency(
  user: User,
  input: { amount: number; reasonCode: string; note?: string; attest: boolean; pin?: string },
  now = Date.now(),
) {
  if (!EMERGENCY_REASONS[input.reasonCode]) throw new HttpError(400, "Choose a reason");
  if (!input.attest) throw new HttpError(400, "Confirm that this is a genuine emergency");
  const rules = rulesFor(user.jurisdiction).emergency;

  return tx(() => {
    const plan = planEmergency(user, input.amount, now);
    const id = newId("emg");
    const tier = plan.tier2 > 0 ? 2 : 1;
    const base = {
      id,
      reason: EMERGENCY_REASONS[input.reasonCode],
    };

    if (plan.needsPin && !checkPin(user, input.pin)) {
      audit({ userId: user.id, actor: user.id, actorType: "user", action: "emergency.pin_failed", entityType: "emergency", entityId: id });
      throw new HttpError(403, "PIN didn't match — Tier 2 access needs your PIN");
    }
    if (plan.needsNote && (input.note ?? "").trim().length < 10) {
      throw new HttpError(400, "Repeat use this month: add a short description (10+ characters)");
    }

    if (plan.blocked) {
      run(
        `INSERT INTO emergency_requests (id, user_id, amount, reason_code, note, tier, plan, guardrails, risk_score, status, receipt_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'blocked', 'not_required', ?)`,
        id,
        user.id,
        input.amount,
        input.reasonCode,
        input.note ?? null,
        tier,
        JSON.stringify(plan.items),
        JSON.stringify(plan.checks),
        plan.risk.score,
        now,
      );
      audit({
        userId: user.id,
        actor: "emergency-orchestrator",
        actorType: "system",
        action: "emergency.blocked",
        entityType: "emergency",
        entityId: id,
        details: { amount: input.amount, blockedBy: plan.checks.filter((c) => c.status === "block").map((c) => c.key) },
        ts: now,
      });
      const velocity = plan.checks.find((c) => c.key === "velocity" && c.status === "block");
      if (velocity)
        raiseFlag({ userId: user.id, source: "emergency", refId: id, severity: "medium", score: 70, description: "Emergency velocity limit hit" });
      return { id, status: "blocked" as const, plan };
    }

    const coolingOff = plan.coolingOff;
    const receiptRequired = tier === 2 || plan.needsNote || plan.risk.score >= 40;
    const status = coolingOff ? "cooling_off" : tier === 2 ? "processing" : "released";
    const releaseAt = coolingOff ? now + rules.cooloffHours * 3_600_000 : tier === 2 ? now + rules.tier2HoldSeconds * 1000 : now;

    const bank = userAccount(user.id, "bank", user.currency);
    if (!coolingOff) {
      for (const item of plan.items.filter((i) => i.tier === 1)) {
        const acct = get<{ account_id: string }>("SELECT account_id FROM vaults WHERE id = ?", item.vaultId)!;
        transfer({
          userId: user.id,
          from: acct.account_id,
          to: bank.id,
          amount: item.amount,
          kind: "emergency",
          memo: `Emergency Tier 1 · ${base.reason}`,
          refType: "emergency",
          refId: id,
          ts: now,
          actor: user.id,
          actorType: "user",
        });
        item.settled = true;
      }
    }

    run(
      `INSERT INTO emergency_requests (id, user_id, amount, reason_code, note, tier, plan, guardrails, risk_score, status,
        release_at, released_at, receipt_status, receipt_due_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      user.id,
      input.amount,
      input.reasonCode,
      input.note ?? null,
      tier,
      JSON.stringify(plan.items),
      JSON.stringify(plan.checks),
      plan.risk.score,
      status,
      releaseAt,
      status === "released" ? now : null,
      receiptRequired ? "requested" : "optional",
      now + rules.receiptWindowDays * DAY,
      now,
    );
    audit({
      userId: user.id,
      actor: user.id,
      actorType: "user",
      action: "emergency.attested",
      entityType: "emergency",
      entityId: id,
      details: {
        amount: input.amount,
        tier,
        reason: input.reasonCode,
        attestation: "I confirm this is a genuine emergency",
        pinVerified: plan.needsPin,
        status,
        plan: plan.items.map((i) => ({ vault: i.vaultName, amount: i.amount, tier: i.tier })),
      },
      ts: now,
    });
    if (plan.risk.score >= 60) {
      raiseFlag({
        userId: user.id,
        source: "emergency",
        refId: id,
        severity: plan.risk.score >= 80 ? "high" : "medium",
        score: plan.risk.score,
        description: `Emergency request risk score ${plan.risk.score}/100 — pattern review`,
      });
    }
    return { id, status, plan, releaseAt, receiptRequired };
  });
}

/** Scheduler tick: releases held Tier 2 / cooling-off funds and marks overdue receipts. */
export function settleEmergencies(user: User, now = Date.now()) {
  const due = all<EmergencyRequestRow>(
    "SELECT * FROM emergency_requests WHERE user_id = ? AND status IN ('processing', 'cooling_off') AND release_at <= ?",
    user.id,
    now,
  );
  for (const r of due) {
    tx(() => {
      const items = parseJson<PlanItem[]>(r.plan, []);
      const bank = userAccount(user.id, "bank", user.currency);
      for (const item of items) {
        if (item.settled) continue;
        const acct = get<{ account_id: string }>("SELECT account_id FROM vaults WHERE id = ?", item.vaultId);
        if (!acct) continue;
        transfer({
          userId: user.id,
          from: acct.account_id,
          to: bank.id,
          amount: item.amount,
          kind: "emergency",
          memo: `Emergency Tier ${item.tier} · ${EMERGENCY_REASONS[r.reason_code] ?? r.reason_code}`,
          refType: "emergency",
          refId: r.id,
          ts: r.release_at ?? now,
          actor: "emergency-orchestrator",
          actorType: "system",
        });
        item.settled = true;
      }
      run(
        "UPDATE emergency_requests SET status = 'released', released_at = ?, plan = ? WHERE id = ?",
        r.release_at ?? now,
        JSON.stringify(items),
        r.id,
      );
    });
  }
  const overdue = all<{ id: string }>(
    "SELECT id FROM emergency_requests WHERE user_id = ? AND receipt_status = 'requested' AND receipt_due_at < ?",
    user.id,
    now,
  );
  for (const o of overdue) {
    run("UPDATE emergency_requests SET receipt_status = 'overdue' WHERE id = ?", o.id);
    raiseFlag({
      userId: user.id,
      source: "emergency",
      refId: o.id,
      severity: "low",
      score: 40,
      description: "Post-hoc emergency receipt is overdue",
    });
  }
}

export function viewRequest(r: EmergencyRequestRow) {
  return {
    id: r.id,
    amount: r.amount,
    reasonCode: r.reason_code,
    reason: EMERGENCY_REASONS[r.reason_code] ?? r.reason_code,
    note: r.note,
    tier: r.tier,
    plan: parseJson<PlanItem[]>(r.plan, []),
    guardrails: parseJson<GuardrailCheck[]>(r.guardrails, []),
    riskScore: r.risk_score,
    status: r.status,
    releaseAt: r.release_at,
    releasedAt: r.released_at,
    receiptStatus: r.receipt_status,
    receiptDueAt: r.receipt_due_at,
    receiptProofId: r.receipt_proof_id,
    createdAt: r.created_at,
  };
}
