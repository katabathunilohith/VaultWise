/** Vaults, simulated: creating and editing them, deposits, withdrawals with proof, and limits. */
import { assertPracticeCanMove } from "./identity"; // identity
import { money } from "../../money";
import { ApiError } from "../errors";
import type { CreateVaultInput, LimitKey, UpdateVaultInput, UploadFile, Vault, VaultDetail, WithdrawalRow } from "../types";
import { submitWithdrawalProof } from "./proofs";
import { settleDue } from "./settle";
import { applyEmergencyCap, clone, currency, findVault, limitsView, newId, PERIOD, recompute, record, S, toMinor, wait, withdrawnToday } from "./state";

export const vaultsApi = {
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
    assertPracticeCanMove(); // identity: read-only while a Practice recovery request waits
    await wait(500);
    const vid = newId("vlt");
    const initial = input.initialDeposit ? toMinor(input.initialDeposit) : 0;
    const now = Date.now();
    const ruleType = input.ruleType ?? "none";
    const v: Vault = {
      id: vid,
      name: input.name,
      category: input.category,
      // custom-rules: a vault with its own rule keeps the "custom" template, as on the server.
      template: input.category === "custom" && input.customRule ? "custom" : (input.template ?? input.category),
      customRule: input.category === "custom" ? (input.customRule ?? null) : null,
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
        { id: newId("mbr"), name: S.me.user.name, role: "owner", contributed: initial },
        ...(input.members ?? []).map((m) => ({ id: newId("mbr"), name: m.name, role: "member", contributed: 0 })),
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
    assertPracticeCanMove(); // identity: read-only while a Practice recovery request waits
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
    assertPracticeCanMove(); // identity: read-only while a Practice recovery request waits
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
    const wid = newId("wdr");
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
    assertPracticeCanMove(); // identity: read-only while a Practice recovery request waits
    await wait(600);
    const w = (S.withdrawals.get(vaultId) ?? []).find((x) => x.id === withdrawalId);
    if (!w) throw new ApiError("Withdrawal not found", 404);
    // Same rule as the server: one bill per request.
    if (w.status !== "awaiting_proof") throw new ApiError("This withdrawal already has a proof", 409);
    return submitWithdrawalProof(findVault(vaultId), w, file);
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
};
