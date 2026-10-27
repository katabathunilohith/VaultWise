import { all, newId, run, tx } from "../db";
import { audit } from "../audit";
import { balanceOf, LedgerError, transfer, userAccount, worldAccount } from "../ledger";
import { fmtMoney } from "../shared";
import { getVaultRow, nextRun, type VaultRow } from "../vaults";
import type { User } from "../users";
import { assertWalletEnabled, walletEnabled, WalletError } from "./config";
import { limitState, RAISE_WINDOW_MS, spentOn } from "./plan";
import { timeZoneFor } from "../timezones";
import { ensureWalletTables, recordPayment, saveWalletSettings, walletSettings, type AutoSaveSource, type WalletSettings } from "./store";

/**
 * Money in and out of the wallet. Every move is one ledger journal plus one audit entry, in one
 * transaction. The wallet account is non-negative, so the ledger refuses any overdraft.
 *
 * Journal kinds: wallet_top_up (bank → wallet), deposit (wallet → vault, the same kind a bank
 * deposit uses so vault history reads the same), contribution_rule (auto-save from the wallet),
 * wallet_spend (wallet → world) and wallet_cash_out (wallet → bank).
 */

export function walletAccount(user: Pick<User, "id" | "currency">) {
  return userAccount(user.id, "wallet", user.currency);
}

function assertAmount(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new WalletError(400, "Enter an amount above zero.", "bad_amount");
}

/** One line of text for a memo: no separators that the activity screens split on. */
function clean(s: string) {
  return s.replace(/[·\s]+/g, " ").trim();
}

function assertWalletHas(user: User, walletId: string, amount: number) {
  const have = balanceOf(walletId);
  if (amount > have) {
    throw new WalletError(400, `Your wallet has ${fmtMoney(have, user.currency)}. Enter that much or less.`, "insufficient_funds");
  }
}

function assertWithinDailyLimit(user: User, walletId: string, amount: number, now: number) {
  const settings = walletSettings(user.id);
  if (settings.dailyLimit === null) return;
  const left = limitState(settings, spentOn(walletId, now, timeZoneFor(user)), now).limitLeftToday ?? 0;
  if (amount > left) {
    throw new WalletError(
      400,
      left > 0
        ? `That's over your daily limit. You can spend ${fmtMoney(left, user.currency)} more today.`
        : `You've reached your daily limit of ${fmtMoney(settings.dailyLimit, user.currency)}. It resets at midnight.`,
      "daily_limit",
    );
  }
}

/** Bank → wallet. */
export function topUp(user: User, amount: number, opts: { ts?: number } = {}) {
  assertWalletEnabled();
  assertAmount(amount);
  ensureWalletTables();
  const ts = opts.ts ?? Date.now();
  return tx(() => {
    const bank = userAccount(user.id, "bank", user.currency);
    const wallet = walletAccount(user);
    const have = balanceOf(bank.id);
    if (amount > have) {
      throw new WalletError(400, `Your bank has ${fmtMoney(have, user.currency)}. Enter that much or less.`, "insufficient_funds");
    }
    const journalId = transfer({
      userId: user.id,
      from: bank.id,
      to: wallet.id,
      amount,
      kind: "wallet_top_up",
      memo: "Added to your wallet · From your bank",
      refType: "wallet",
      refId: wallet.id,
      ts,
      actor: user.id,
      actorType: "user",
    });
    audit({ userId: user.id, actor: user.id, actorType: "user", action: "wallet.topped_up", entityType: "journal", entityId: journalId, details: { amount, from: "bank" }, ts });
    return journalId;
  });
}

/**
 * Wallet → vault, posted like a bank deposit (kind, ref and joint-vault share) so vault history,
 * streaks and badges treat it the same. Money never goes the other way: vaults release only
 * through proof-checked withdrawals.
 */
function depositFromWallet(user: User, v: VaultRow, amount: number, opts: { kind: "deposit" | "contribution_rule"; memo: string; ts: number }) {
  const wallet = walletAccount(user);
  const journalId = transfer({
    userId: user.id,
    from: wallet.id,
    to: v.account_id,
    amount,
    kind: opts.kind,
    memo: opts.memo,
    refType: "vault",
    refId: v.id,
    ts: opts.ts,
    actor: user.id,
    actorType: opts.kind === "contribution_rule" ? "system" : "user",
  });
  if (v.is_joint) run("UPDATE vault_members SET contributed = contributed + ? WHERE vault_id = ? AND role = 'owner'", amount, v.id);
  return journalId;
}

export function moveToVault(user: User, vaultId: string, amount: number, opts: { ts?: number } = {}) {
  assertWalletEnabled();
  assertAmount(amount);
  ensureWalletTables();
  const ts = opts.ts ?? Date.now();
  return tx(() => {
    const v = getVaultRow(user, vaultId);
    if (v.status === "closed") throw new WalletError(400, "That vault is closed.", "vault_closed");
    assertWalletHas(user, walletAccount(user).id, amount);
    const journalId = depositFromWallet(user, v, amount, { kind: "deposit", memo: `Contribution to ${v.name} · From your wallet`, ts });
    audit({
      userId: user.id,
      actor: user.id,
      actorType: "user",
      action: "wallet.moved_to_vault",
      entityType: "journal",
      entityId: journalId,
      details: { amount, vaultId: v.id, vault: v.name },
      ts,
    });
    return journalId;
  });
}

/** Wallet → someone else. Counts toward the daily limit. */
export function spend(user: User, input: { amount: number; payee: string; note?: string | null }, opts: { ts?: number } = {}) {
  assertWalletEnabled();
  assertAmount(input.amount);
  const payee = clean(input.payee);
  if (payee.length < 2) throw new WalletError(400, "Say who you're paying.", "bad_payee");
  const note = input.note ? input.note.trim() || null : null;
  ensureWalletTables();
  const ts = opts.ts ?? Date.now();
  return tx(() => {
    const wallet = walletAccount(user);
    assertWithinDailyLimit(user, wallet.id, input.amount, ts);
    assertWalletHas(user, wallet.id, input.amount);
    const paymentId = newId("wpm");
    const journalId = transfer({
      userId: user.id,
      from: wallet.id,
      to: worldAccount(user.currency).id,
      amount: input.amount,
      kind: "wallet_spend",
      memo: `Paid ${payee} · From your wallet`,
      refType: "wallet_payment",
      refId: paymentId,
      ts,
      actor: user.id,
      actorType: "user",
    });
    recordPayment({ id: paymentId, userId: user.id, journalId, payee, note, at: ts });
    audit({
      userId: user.id,
      actor: user.id,
      actorType: "user",
      action: "wallet.spent",
      entityType: "journal",
      entityId: journalId,
      details: { amount: input.amount, payee, note },
      ts,
    });
    return journalId;
  });
}

/** Wallet → bank. Counts toward the daily limit. Works even with the wallet switched off. */
export function cashOut(user: User, amount: number, opts: { ts?: number } = {}) {
  assertAmount(amount);
  ensureWalletTables();
  const ts = opts.ts ?? Date.now();
  return tx(() => {
    const wallet = walletAccount(user);
    assertWithinDailyLimit(user, wallet.id, amount, ts);
    assertWalletHas(user, wallet.id, amount);
    const journalId = transfer({
      userId: user.id,
      from: wallet.id,
      to: userAccount(user.id, "bank", user.currency).id,
      amount,
      kind: "wallet_cash_out",
      memo: "Moved to your bank · From your wallet",
      refType: "wallet",
      refId: wallet.id,
      ts,
      actor: user.id,
      actorType: "user",
    });
    audit({ userId: user.id, actor: user.id, actorType: "user", action: "wallet.cashed_out", entityType: "journal", entityId: journalId, details: { amount, to: "bank" }, ts });
    return journalId;
  });
}

/**
 * Changes the daily limit and where auto-saves come from. Turning a limit on or lowering it is
 * always allowed. Raising it or turning it off is allowed once per 30 days.
 */
export function updateWalletSettings(
  user: User,
  input: { dailyLimit?: number | null; autoSaveSource?: AutoSaveSource },
  opts: { ts?: number } = {},
): WalletSettings {
  assertWalletEnabled();
  const now = opts.ts ?? Date.now();
  const before = walletSettings(user.id);
  const after: WalletSettings = { ...before };
  let raised = false;
  if (input.dailyLimit !== undefined) {
    const next = input.dailyLimit;
    if (next !== null && (!Number.isInteger(next) || next <= 0)) throw new WalletError(400, "Enter a daily limit above zero.", "bad_amount");
    raised = before.dailyLimit !== null && (next === null || next > before.dailyLimit);
    if (raised) {
      const state = limitState(before, 0, now);
      if (!state.limitRaiseAvailable) {
        const when = new Date(state.nextRaiseAt!).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
        throw new WalletError(
          409,
          `You can raise or turn off your daily limit once every 30 days. You can do it again on ${when}. You can lower it any time.`,
          "limit_raise_locked",
        );
      }
      after.limitRaisedAt = now;
    }
    after.dailyLimit = next;
  }
  if (input.autoSaveSource !== undefined) after.autoSaveSource = input.autoSaveSource;
  if (after.dailyLimit === before.dailyLimit && after.autoSaveSource === before.autoSaveSource) return before;
  tx(() => {
    saveWalletSettings(user.id, after);
    audit({
      userId: user.id,
      actor: user.id,
      actorType: "user",
      action: "wallet.settings_changed",
      entityType: "user",
      entityId: user.id,
      details: {
        before: { dailyLimit: before.dailyLimit, autoSaveSource: before.autoSaveSource },
        after: { dailyLimit: after.dailyLimit, autoSaveSource: after.autoSaveSource },
        raised,
        nextRaiseAt: raised ? now + RAISE_WINDOW_MS : null,
      },
      ts: now,
    });
  });
  return after;
}

/** Where this customer's auto-saves come from. Always the bank while the wallet is switched off. */
export function autoSaveSource(user: Pick<User, "id">): AutoSaveSource {
  if (!walletEnabled()) return "bank";
  return walletSettings(user.id).autoSaveSource;
}

/**
 * Scheduler tick for fixed recurring rules when auto-saves come from the wallet. The same as
 * runDueContributions in lib/vaults.ts, drawing from the wallet: a run the wallet can't cover is
 * recorded as missed (contribution.missed) and skipped, and the schedule still moves on.
 */
export function runDueWalletContributions(user: User, now = Date.now()) {
  ensureWalletTables();
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
        depositFromWallet(user, v, v.rule_amount!, {
          kind: "contribution_rule",
          memo: `Scheduled ${v.rule_frequency} contribution · From your wallet`,
          ts: at,
        });
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
          details: { amount: v.rule_amount, reason: e.message, source: "wallet" },
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
