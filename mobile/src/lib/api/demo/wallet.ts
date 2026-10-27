/**
 * Wallet in Practice: the same methods as walletLive (lib/api/wallet.ts), on simulator state
 * (S.wallet, seeded by wallet-state.ts). It mirrors the server's rules (src/lib/wallet): payday
 * from the income credits, safe to spend today, the daily limit (lower or turn on any time; raise
 * or turn off once per 30 days), and auto-saves drawn from the bank or the wallet.
 */
import { money } from "../../money";
import { ApiError } from "../errors";
import type { Millis, Minor } from "../types";
import { WALLET_MAX_AMOUNT, WALLET_NOTE_MAX, WALLET_PAYEE_MAX, type Wallet, type WalletActivity, type WalletMoveResult, type WalletSettingsInput, type WalletSettingsResult } from "../wallet-types";
import { clone, currency, DAY, findVault, journal, newId, recompute, record, S, toMinor, wait } from "./state";
import { assertPracticeCanMove } from "./identity"; // identity

/** Raising (or turning off) the daily limit is allowed once in this window. */
const RAISE_WINDOW = 30 * DAY;
const DEFAULT_PAY_GAP = 30 * DAY;

/**
 * An ApiError carrying the server's machine-readable code (kyc_required, daily_limit, ...). A body
 * the server's schema turns away (an amount out of range, a payee or note too long) has no code.
 */
function fail(status: number, message: string, code?: string): never {
  throw new ApiError(message, status, code);
}

function dayStart(ts: number) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function daysBetween(a: number, b: number) {
  return Math.round((dayStart(b) - dayStart(a)) / DAY);
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Same as the server: last income + the median gap between incomes (credits on the same day count
 * once), rolled forward by whole gaps past today. No income yet: 30 days from now.
 */
function payday(now: number) {
  const paydays: number[] = [];
  for (const t of S.wallet.incomes.filter((x) => x <= now).sort((a, b) => b - a)) {
    if (paydays.length && dayStart(paydays[paydays.length - 1]) === dayStart(t)) paydays[paydays.length - 1] = t;
    else paydays.push(t);
  }
  if (!paydays.length) {
    const next = now + DEFAULT_PAY_GAP;
    return { next, days: Math.max(1, daysBetween(now, next)), basis: "default" as const };
  }
  const gaps = paydays.slice(0, -1).map((t, i) => t - paydays[i + 1]);
  const gap = gaps.length ? Math.max(DAY, median(gaps)) : DEFAULT_PAY_GAP;
  const today = dayStart(now);
  let next = paydays[0] + gap;
  while (dayStart(next) < today) next += gap;
  return { next, days: Math.max(1, daysBetween(now, next)), basis: "income" as const };
}

/** The server's scheduler stepping (`nextRun` in src/lib/vaults.ts). */
function nextRun(from: number, frequency: string | null) {
  const d = new Date(from);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "biweekly") d.setDate(d.getDate() + 14);
  else d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

/**
 * Fixed auto-saves due from the wallet before `until`. The simulator has no scheduler, so the
 * snapshot's past run dates roll forward to the next one instead of piling up as overdue.
 */
function upcomingFromWallet(now: number, until: number) {
  if (S.wallet.autoSaveSource !== "wallet") return 0;
  let total = 0;
  for (const v of S.vaults) {
    if (v.status !== "locked" || v.rule.type !== "fixed" || !v.rule.amount || v.rule.nextRunAt === null) continue;
    let at = v.rule.nextRunAt;
    let guard = 0;
    while (at < now && guard++ < 400) at = nextRun(at, v.rule.frequency);
    while (at < until && guard++ < 460) {
      total += v.rule.amount;
      at = nextRun(at, v.rule.frequency);
    }
  }
  return total;
}

/** Spends and cash-outs from the wallet today: what the daily limit counts. */
function spentToday(now: number) {
  const since = dayStart(now);
  return S.wallet.moves.filter((m) => m.createdAt >= since && (m.kind === "spend" || m.kind === "cash_out")).reduce((s, m) => s - m.amount, 0);
}

function raiseState(now: number) {
  const at = S.wallet.limitRaisedAt;
  const available = at === null || now - at >= RAISE_WINDOW;
  return { available, nextAt: available || at === null ? null : at + RAISE_WINDOW };
}

function view(now = Date.now()): Wallet {
  const w = S.wallet;
  const pay = payday(now);
  const spent = spentToday(now);
  const limitLeft = w.dailyLimit === null ? null : Math.max(0, w.dailyLimit - spent);
  const upcoming = upcomingFromWallet(now, pay.next);
  const perDay = Math.floor(Math.max(0, w.balance - upcoming) / pay.days);
  const raise = raiseState(now);
  return {
    enabled: true,
    currency,
    balance: w.balance,
    bankBalance: S.totals.bank,
    safeToSpendToday: limitLeft === null ? perDay : Math.min(perDay, limitLeft),
    daysToPayday: pay.days,
    nextPayday: pay.next,
    paydayBasis: pay.basis,
    dailyLimit: w.dailyLimit,
    spentToday: spent,
    limitLeftToday: limitLeft,
    limitRaiseAvailable: raise.available,
    nextRaiseAt: raise.nextAt,
    autoSaveSource: w.autoSaveSource,
    upcomingFromWallet: upcoming,
    recent: clone(w.moves.slice(0, 20)),
  };
}

/** Same gate as the server's `customer({ kyc: true })` on money moves. */
function assertCanMove() {
  assertPracticeCanMove(); // identity: read-only while a Practice recovery request waits
  const kyc = S.me.user.kycStatus;
  if (kyc && kyc !== "verified") fail(403, "Verify your ID to move money.", "kyc_required");
}

/** As the server: its schema first (a positive number up to the most allowed), then whole minor units. */
function amountOf(major: number) {
  if (!Number.isFinite(major) || major <= 0) fail(400, "Enter an amount above zero.");
  if (major > WALLET_MAX_AMOUNT) fail(400, "That amount is too large.");
  const amount = toMinor(major);
  if (amount <= 0) fail(400, "Enter an amount above zero.", "bad_amount");
  return amount;
}

function assertWalletHas(amount: Minor) {
  if (amount > S.wallet.balance) fail(400, `Your wallet has ${money(S.wallet.balance, currency)}. Enter that much or less.`, "insufficient_funds");
}

function assertWithinDailyLimit(amount: Minor, now: number) {
  const limit = S.wallet.dailyLimit;
  if (limit === null) return;
  const left = Math.max(0, limit - spentToday(now));
  if (amount > left)
    fail(
      400,
      left > 0
        ? `That's over your daily limit. You can spend ${money(left, currency)} more today.`
        : `You've reached your daily limit of ${money(limit, currency)}. It resets at midnight.`,
      "daily_limit",
    );
}

/** One line of text: no separators the activity screens split on. */
const clean = (s: string) => s.replace(/[·\s]+/g, " ").trim();

function addMove(m: Omit<WalletActivity, "id" | "createdAt">, at: Millis) {
  S.wallet.moves.unshift({ id: newId("wmv"), createdAt: at, ...m });
  S.wallet.balance += m.amount;
}

const done = (journalId: string): WalletMoveResult => ({ journalId, wallet: view() });

export const walletDemo = {
  wallet: async (): Promise<Wallet> => {
    await wait(200);
    // identity: the server answers most reads with 403 recovery_restricted while a recovery waits.
    assertPracticeCanMove();
    return view();
  },
  walletTopUp: async (amountMajor: number): Promise<WalletMoveResult> => {
    await wait(450);
    assertCanMove();
    const amount = amountOf(amountMajor);
    if (amount > S.totals.bank) fail(400, `Your bank has ${money(S.totals.bank, currency)}. Enter that much or less.`, "insufficient_funds");
    const now = Date.now();
    S.totals.bank -= amount;
    addMove({ kind: "top_up", memo: "Added to your wallet · From your bank", amount, counterparty: "Your bank", note: null }, now);
    const jid = newId("jnl");
    journal(jid, "wallet_top_up", "Added to your wallet · From your bank", now, [
      { account: "Linked bank account", kind: "bank", amount: -amount },
      { account: "Wallet", kind: "wallet", amount },
    ]);
    return done(jid);
  },
  walletMove: async (vaultId: string, amountMajor: number): Promise<WalletMoveResult> => {
    await wait(450);
    assertCanMove();
    const amount = amountOf(amountMajor);
    const v = findVault(vaultId);
    if (v.status === "closed") fail(400, "That vault is closed.", "vault_closed");
    assertWalletHas(amount);
    const now = Date.now();
    const memo = `Contribution to ${v.name} · From your wallet`;
    v.balance += amount;
    v.lastContributionAt = now;
    recompute(v);
    record("deposit", memo, v, amount, { account: "Wallet", kind: "wallet" });
    addMove({ kind: "move", memo, amount: -amount, counterparty: v.name, note: null }, now);
    return done(S.journals[0].id);
  },
  walletSpend: async (amountMajor: number, payee: string, note?: string | null): Promise<WalletMoveResult> => {
    await wait(500);
    assertCanMove();
    const amount = amountOf(amountMajor);
    // The server's schema first (no code), then its own check on the cleaned-up name.
    const named = payee.trim();
    if (named.length < 2) fail(400, "Say who you're paying.");
    if (named.length > WALLET_PAYEE_MAX) fail(400, `Keep the name to ${WALLET_PAYEE_MAX} characters.`);
    const said = note?.trim() || null;
    if (said && said.length > WALLET_NOTE_MAX) fail(400, `Keep the note to ${WALLET_NOTE_MAX} characters.`);
    const to = clean(named);
    if (to.length < 2) fail(400, "Say who you're paying.", "bad_payee");
    const now = Date.now();
    assertWithinDailyLimit(amount, now);
    assertWalletHas(amount);
    const memo = `Paid ${to} · From your wallet`;
    addMove({ kind: "spend", memo, amount: -amount, counterparty: to, note: said }, now);
    const jid = newId("jnl");
    journal(jid, "wallet_spend", memo, now, [
      { account: "Wallet", kind: "wallet", amount: -amount },
      { account: to, kind: "world", amount },
    ]);
    return done(jid);
  },
  walletCashOut: async (amountMajor: number): Promise<WalletMoveResult> => {
    await wait(450);
    assertCanMove();
    const amount = amountOf(amountMajor);
    const now = Date.now();
    assertWithinDailyLimit(amount, now);
    assertWalletHas(amount);
    S.totals.bank += amount;
    addMove({ kind: "cash_out", memo: "Moved to your bank · From your wallet", amount: -amount, counterparty: "Your bank", note: null }, now);
    const jid = newId("jnl");
    journal(jid, "wallet_cash_out", "Moved to your bank · From your wallet", now, [
      { account: "Wallet", kind: "wallet", amount: -amount },
      { account: "Linked bank account", kind: "bank", amount },
    ]);
    return done(jid);
  },
  walletSettings: async (input: WalletSettingsInput): Promise<WalletSettingsResult> => {
    await wait(350);
    // A write like any other: refused while a Practice recovery request waits (no ID check needed).
    assertPracticeCanMove(); // identity
    const w = S.wallet;
    const now = Date.now();
    if (input.dailyLimit !== undefined) {
      const major = input.dailyLimit;
      if (major !== null && (!Number.isFinite(major) || major <= 0)) fail(400, "Enter a daily limit above zero.");
      if (major !== null && major > WALLET_MAX_AMOUNT) fail(400, "That limit is too large.");
      const next = major === null ? null : toMinor(major);
      if (next !== null && next <= 0) fail(400, "Enter a daily limit above zero.", "bad_amount");
      const raised = w.dailyLimit !== null && (next === null || next > w.dailyLimit);
      if (raised) {
        const r = raiseState(now);
        if (!r.available) {
          const when = new Date(r.nextAt!).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
          fail(409, `You can raise or turn off your daily limit once every 30 days. You can do it again on ${when}. You can lower it any time.`, "limit_raise_locked");
        }
        w.limitRaisedAt = now;
      }
      w.dailyLimit = next;
    }
    if (input.autoSaveSource !== undefined) w.autoSaveSource = input.autoSaveSource;
    return { wallet: view(now) };
  },
};
