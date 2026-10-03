import { all, get, newId, run, tx } from "./db";
import { audit } from "./audit";
import { balanceOf, ensureAccount, transfer, userAccount, worldAccount, LedgerError } from "./ledger";
import { HttpError, type User } from "./users";
import { CATEGORIES, type VaultCategory } from "./shared";

export interface VaultRow {
  id: string;
  user_id: string;
  account_id: string;
  name: string;
  category: VaultCategory;
  template: VaultCategory;
  target_amount: number;
  target_date: string | null;
  rule_type: "none" | "fixed" | "percent_income" | "roundup";
  rule_amount: number | null;
  rule_percent: number | null;
  rule_frequency: "weekly" | "biweekly" | "monthly" | null;
  next_run_at: number | null;
  is_joint: number;
  status: string;
  created_at: number;
}

export interface VaultView {
  id: string;
  name: string;
  category: VaultCategory;
  template: VaultCategory;
  target: number;
  targetDate: string | null;
  balance: number;
  held: number;
  available: number;
  progress: number;
  monthlyNeeded: number | null;
  rule: { type: VaultRow["rule_type"]; amount: number | null; percent: number | null; frequency: string | null; nextRunAt: number | null };
  isJoint: boolean;
  members: { id: string; name: string; role: string; contributed: number }[];
  status: string;
  createdAt: number;
  lastContributionAt: number | null;
  currency: string;
}

const ACTIVE_HOLD_STATUSES = ["awaiting_proof", "verifying", "in_review", "appealed"];

/** Funds reserved by in-flight withdrawals and by pending (held) emergency releases. */
export function heldFor(vaultId: string) {
  const withdrawals =
    get<{ s: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM withdrawals WHERE vault_id = ? AND status IN (${ACTIVE_HOLD_STATUSES.map(() => "?").join(",")})`,
      vaultId,
      ...ACTIVE_HOLD_STATUSES,
    )?.s ?? 0;
  const emergency =
    get<{ s: number }>(
      `SELECT COALESCE(SUM(json_extract(j.value, '$.amount')), 0) AS s
       FROM emergency_requests r, json_each(r.plan) j
       WHERE r.status IN ('processing', 'cooling_off')
         AND json_extract(j.value, '$.vaultId') = ? AND json_extract(j.value, '$.settled') = 0`,
      vaultId,
    )?.s ?? 0;
  return withdrawals + emergency;
}

export function toView(v: VaultRow, currency: string): VaultView {
  const balance = balanceOf(v.account_id);
  const held = heldFor(v.id);
  let monthlyNeeded: number | null = null;
  if (v.target_date) {
    const months = Math.max(1, (new Date(v.target_date).getTime() - Date.now()) / (30.44 * 86400_000));
    monthlyNeeded = Math.max(0, Math.round((v.target_amount - balance) / months));
  }
  const last = get<{ t: number }>(`SELECT MAX(e.created_at) AS t FROM ledger_entries e WHERE e.account_id = ? AND e.amount > 0`, v.account_id)?.t;
  return {
    id: v.id,
    name: v.name,
    category: v.category,
    template: v.template,
    target: v.target_amount,
    targetDate: v.target_date,
    balance,
    held,
    available: balance - held,
    progress: v.target_amount > 0 ? Math.min(1, balance / v.target_amount) : 0,
    monthlyNeeded,
    rule: {
      type: v.rule_type,
      amount: v.rule_amount,
      percent: v.rule_percent,
      frequency: v.rule_frequency,
      nextRunAt: v.next_run_at,
    },
    isJoint: !!v.is_joint,
    members: all<{ id: string; name: string; role: string; contributed: number }>(
      "SELECT id, name, role, contributed FROM vault_members WHERE vault_id = ? ORDER BY created_at",
      v.id,
    ),
    status: v.status,
    createdAt: v.created_at,
    lastContributionAt: last ?? null,
    currency,
  };
}

export function listVaults(user: User): VaultView[] {
  return all<VaultRow>("SELECT * FROM vaults WHERE user_id = ? AND status != 'closed' ORDER BY created_at", user.id).map((v) =>
    toView(v, user.currency),
  );
}

export function getVaultRow(user: User, id: string): VaultRow {
  const v = get<VaultRow>("SELECT * FROM vaults WHERE id = ? AND user_id = ?", id, user.id);
  if (!v) throw new HttpError(404, "Vault not found");
  return v;
}

export function nextRun(from: number, frequency: string | null) {
  const d = new Date(from);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "biweekly") d.setDate(d.getDate() + 14);
  else d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

export function createVault(
  user: User,
  input: {
    name: string;
    category: VaultCategory;
    template?: VaultCategory;
    target: number;
    targetDate?: string | null;
    ruleType?: VaultRow["rule_type"];
    ruleAmount?: number | null;
    rulePercent?: number | null;
    ruleFrequency?: VaultRow["rule_frequency"];
    isJoint?: boolean;
    members?: { name: string; email?: string }[];
    createdAt?: number;
  },
) {
  return tx(() => {
    const id = newId("vlt");
    const createdAt = input.createdAt ?? Date.now();
    // Custom vaults borrow a verification template; with none chosen they get the strictest tier.
    const template = input.category === "custom" ? (input.template ?? "custom") : input.category;
    const acct = ensureAccount({
      userId: user.id,
      kind: "vault",
      name: `Vault · ${input.name}`,
      currency: user.currency,
      refId: id,
    });
    const ruleType = input.ruleType ?? "none";
    run(
      `INSERT INTO vaults (id, user_id, account_id, name, category, template, target_amount, target_date,
        rule_type, rule_amount, rule_percent, rule_frequency, next_run_at, is_joint, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'locked', ?)`,
      id,
      user.id,
      acct.id,
      input.name,
      input.category,
      template,
      input.target,
      input.targetDate ?? null,
      ruleType,
      ruleType === "fixed" ? (input.ruleAmount ?? null) : null,
      ruleType === "percent_income" ? (input.rulePercent ?? null) : null,
      ruleType === "fixed" ? (input.ruleFrequency ?? "monthly") : null,
      ruleType === "fixed" ? nextRun(createdAt, input.ruleFrequency ?? "monthly") : null,
      input.isJoint ? 1 : 0,
      createdAt,
    );
    if (input.isJoint) {
      run(
        "INSERT INTO vault_members (id, vault_id, name, email, role, contributed, created_at) VALUES (?, ?, ?, ?, 'owner', 0, ?)",
        newId("mbr"),
        id,
        user.name,
        user.email,
        createdAt,
      );
      for (const m of input.members ?? []) {
        run(
          "INSERT INTO vault_members (id, vault_id, name, email, role, contributed, created_at) VALUES (?, ?, ?, ?, 'co-saver', 0, ?)",
          newId("mbr"),
          id,
          m.name,
          m.email ?? null,
          createdAt,
        );
      }
    }
    audit({
      userId: user.id,
      actor: user.id,
      actorType: "user",
      action: "vault.created",
      entityType: "vault",
      entityId: id,
      details: { name: input.name, category: input.category, template, target: input.target, rule: ruleType },
      ts: createdAt,
    });
    return id;
  });
}

export function deposit(user: User, vaultId: string, amount: number, opts: { memo?: string; kind?: string; ts?: number; memberId?: string } = {}) {
  const v = getVaultRow(user, vaultId);
  if (v.status === "closed") throw new HttpError(400, "Vault is closed");
  const bank = userAccount(user.id, "bank", user.currency);
  const journalId = transfer({
    userId: user.id,
    from: bank.id,
    to: v.account_id,
    amount,
    kind: opts.kind ?? "deposit",
    memo: opts.memo ?? `Contribution to ${v.name}`,
    refType: "vault",
    refId: v.id,
    ts: opts.ts,
    actor: user.id,
    actorType: opts.kind === "contribution_rule" || opts.kind === "roundup" ? "system" : "user",
  });
  if (opts.memberId) run("UPDATE vault_members SET contributed = contributed + ? WHERE id = ?", amount, opts.memberId);
  else if (v.is_joint) run("UPDATE vault_members SET contributed = contributed + ? WHERE vault_id = ? AND role = 'owner'", amount, v.id);
  return journalId;
}

/** Scheduler tick for fixed recurring rules. Missed runs are recorded, not retried silently. */
export function runDueContributions(user: User, now = Date.now()) {
  const due = all<VaultRow>(
    "SELECT * FROM vaults WHERE user_id = ? AND rule_type = 'fixed' AND status = 'locked' AND next_run_at <= ?",
    user.id,
    now,
  );
  const results: { vaultId: string; status: "ok" | "missed"; amount: number }[] = [];
  for (const v of due) {
    let at = v.next_run_at!;
    let guard = 0;
    while (at <= now && guard++ < 12) {
      try {
        deposit(user, v.id, v.rule_amount!, { kind: "contribution_rule", memo: `Scheduled ${v.rule_frequency} contribution`, ts: at });
        results.push({ vaultId: v.id, status: "ok", amount: v.rule_amount! });
      } catch (e) {
        if (!(e instanceof LedgerError)) throw e;
        audit({
          userId: user.id,
          actor: "scheduler",
          actorType: "system",
          action: "contribution.missed",
          entityType: "vault",
          entityId: v.id,
          details: { amount: v.rule_amount, reason: e.message },
          ts: at,
        });
        results.push({ vaultId: v.id, status: "missed", amount: v.rule_amount! });
      }
      at = nextRun(at, v.rule_frequency);
    }
    run("UPDATE vaults SET next_run_at = ? WHERE id = ?", at, v.id);
  }
  return results;
}

export function creditIncome(user: User, amount: number, employer: string, ts = Date.now()) {
  return tx(() => {
    const bank = userAccount(user.id, "bank", user.currency);
    const world = worldAccount(user.currency);
    const txnId = newId("btx");
    const journalId = transfer({
      userId: user.id,
      from: world.id,
      to: bank.id,
      amount,
      kind: "income",
      memo: `Salary from ${employer}`,
      refType: "bank_txn",
      refId: txnId,
      ts,
    });
    run(
      `INSERT INTO bank_transactions (id, user_id, merchant, category, amount, direction, roundup, roundup_status, journal_id, created_at)
       VALUES (?, ?, ?, 'income', ?, 'credit', 0, 'none', ?, ?)`,
      txnId,
      user.id,
      employer,
      amount,
      journalId,
      ts,
    );
    // Percentage-of-income rules fire on detected income.
    const pctVaults = all<VaultRow>("SELECT * FROM vaults WHERE user_id = ? AND rule_type = 'percent_income' AND status = 'locked'", user.id);
    const swept: { vaultId: string; amount: number }[] = [];
    for (const v of pctVaults) {
      const amt = Math.round((amount * (v.rule_percent ?? 0)) / 100);
      if (amt > 0) {
        deposit(user, v.id, amt, { kind: "contribution_rule", memo: `${v.rule_percent}% of detected income`, ts: ts + 1000 });
        swept.push({ vaultId: v.id, amount: amt });
      }
    }
    return { txnId, swept };
  });
}

export function recordSpend(user: User, merchant: string, category: string, amount: number, ts = Date.now()) {
  return tx(() => {
    const bank = userAccount(user.id, "bank", user.currency);
    const world = worldAccount(user.currency);
    const txnId = newId("btx");
    const journalId = transfer({
      userId: user.id,
      from: bank.id,
      to: world.id,
      amount,
      kind: "card_spend",
      memo: `Card · ${merchant}`,
      refType: "bank_txn",
      refId: txnId,
      ts,
    });
    const hasRoundupVault = !!get("SELECT 1 FROM vaults WHERE user_id = ? AND rule_type = 'roundup' AND status = 'locked'", user.id);
    const roundup = amount % 100 === 0 ? 0 : 100 - (amount % 100);
    run(
      `INSERT INTO bank_transactions (id, user_id, merchant, category, amount, direction, roundup, roundup_status, journal_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?, ?)`,
      txnId,
      user.id,
      merchant,
      category,
      amount,
      roundup,
      hasRoundupVault && roundup > 0 ? "pending" : "none",
      journalId,
      ts,
    );
    return txnId;
  });
}

export function sweepRoundups(user: User, ts = Date.now()) {
  return tx(() => {
    const target = get<VaultRow>(
      "SELECT * FROM vaults WHERE user_id = ? AND rule_type = 'roundup' AND status = 'locked' ORDER BY created_at LIMIT 1",
      user.id,
    );
    if (!target) throw new HttpError(400, "No vault has the round-up rule enabled");
    const pending = all<{ id: string; roundup: number }>(
      "SELECT id, roundup FROM bank_transactions WHERE user_id = ? AND roundup_status = 'pending'",
      user.id,
    );
    const total = pending.reduce((s, p) => s + p.roundup, 0);
    if (total === 0) return { swept: 0, count: 0, vaultId: target.id };
    deposit(user, target.id, total, { kind: "roundup", memo: `Round-ups from ${pending.length} card purchases`, ts });
    for (const p of pending) run("UPDATE bank_transactions SET roundup_status = 'swept' WHERE id = ?", p.id);
    return { swept: total, count: pending.length, vaultId: target.id };
  });
}

export function pendingRoundups(user: User) {
  return (
    get<{ s: number; n: number }>(
      "SELECT COALESCE(SUM(roundup), 0) AS s, COUNT(*) AS n FROM bank_transactions WHERE user_id = ? AND roundup_status = 'pending'",
      user.id,
    ) ?? { s: 0, n: 0 }
  );
}

export function createWithdrawal(user: User, vaultId: string, amount: number, payee: string, note?: string) {
  const v = getVaultRow(user, vaultId);
  const view = toView(v, user.currency);
  if (amount <= 0) throw new HttpError(400, "Amount must be positive");
  if (amount > view.available) throw new HttpError(400, "Amount exceeds the vault's available balance");
  const id = newId("wdr");
  const now = Date.now();
  run(
    `INSERT INTO withdrawals (id, user_id, vault_id, amount, payee, note, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'awaiting_proof', ?)`,
    id,
    user.id,
    vaultId,
    amount,
    payee,
    note ?? null,
    now,
  );
  audit({
    userId: user.id,
    actor: user.id,
    actorType: "user",
    action: "withdrawal.requested",
    entityType: "withdrawal",
    entityId: id,
    details: { vaultId, amount, payee, category: v.category, proofRequired: CATEGORIES[v.template].proofHint },
  });
  return id;
}

/** Releases an approved, proof-gated withdrawal from the vault to the linked bank. */
export function payoutWithdrawal(user: User, withdrawalId: string, actor: string, actorType: "model" | "reviewer") {
  return tx(() => {
    const w = get<{ id: string; vault_id: string; amount: number; payee: string; status: string }>(
      "SELECT * FROM withdrawals WHERE id = ?",
      withdrawalId,
    );
    if (!w) throw new HttpError(404, "Withdrawal not found");
    if (w.status === "paid") return;
    const v = getVaultRow(user, w.vault_id);
    const bank = userAccount(user.id, "bank", user.currency);
    const journalId = transfer({
      userId: user.id,
      from: v.account_id,
      to: bank.id,
      amount: w.amount,
      kind: "withdrawal",
      memo: `Verified withdrawal · ${w.payee}`,
      refType: "withdrawal",
      refId: w.id,
      actor,
      actorType,
    });
    run("UPDATE withdrawals SET status = 'paid', journal_id = ?, decided_at = ? WHERE id = ?", journalId, Date.now(), w.id);
  });
}
