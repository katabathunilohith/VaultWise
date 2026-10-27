/**
 * The wallet's words and rules as the screens show them: where each action goes, how payday and
 * safe to spend are described, what a recent movement is called, and why an amount can't go out.
 */
import type { Href } from "expo-router";
import { ArrowDownLeftIcon, BankIcon, PaperPlaneRightIcon, PlusIcon, RepeatIcon, VaultIcon, type Icon } from "@/components/icons";
import { dayDiff, shortDate } from "@/features/home/format";
import { ApiError, errorMessage } from "@/lib/api/errors";
import type { Minor } from "@/lib/api/types";
import type { Wallet, WalletActivity } from "@/lib/api/wallet-types";
import { money, moneyWhole } from "@/lib/money";

export type WalletAction = "add" | "move" | "spend" | "cash-out" | "limit";

export const WALLET_ACTIONS: WalletAction[] = ["add", "move", "spend", "cash-out", "limit"];

export function isWalletAction(a: string | undefined): a is WalletAction {
  return !!a && (WALLET_ACTIONS as string[]).includes(a);
}

/** The four money actions on the Wallet screen. `outgoing` ones stop when the server's wallet is off, except cash out. */
export const MONEY_ACTIONS: { action: Exclude<WalletAction, "limit">; label: string; hint: string; icon: Icon }[] = [
  { action: "add", label: "Add money", hint: "Add money from your bank", icon: PlusIcon },
  { action: "move", label: "Move to a vault", hint: "Lock money from your wallet in a vault", icon: VaultIcon },
  { action: "spend", label: "Pay someone", hint: "Pay a person or a shop from your wallet", icon: PaperPlaneRightIcon },
  { action: "cash-out", label: "Cash out", hint: "Move money from your wallet to your bank", icon: BankIcon },
];

/**
 * Wallet routes. Typed routes pick up /wallet on the next `expo start`; until then the paths are
 * cast here, in one place.
 */
const asHref = (path: string) => path as Href;
export const WALLET_HREF = asHref("/wallet");
export function walletActionHref(action: WalletAction, params: Record<string, string> = {}) {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return asHref(`/wallet/${action}${query ? `?${query}` : ""}`);
}

/** An amount in a sentence: "₹2,500" when it's whole, "₹1,141.50" when it isn't. */
export function amountText(amount: Minor, currency: string) {
  return amount % 100 === 0 ? moneyWhole(amount, currency) : money(amount, currency);
}

/** What the daily limit still allows today, or null when there's no limit. */
export function limitLeft(w: Wallet): Minor | null {
  if (w.dailyLimit === null) return null;
  return w.limitLeftToday ?? Math.max(0, w.dailyLimit - w.spentToday);
}

/** "Payday in 20 days, on 2 Nov." */
export function paydayLine(w: Wallet, now: number) {
  if (w.paydayBasis === "default") return `No payday has come in yet, so this plans for the next ${w.daysToPayday} days.`;
  if (w.daysToPayday <= 1) return dayDiff(w.nextPayday, now) <= 0 ? "Payday is today." : "Payday is tomorrow.";
  return `Payday in ${w.daysToPayday} days, on ${shortDate(w.nextPayday, now)}.`;
}

/** How safe to spend was worked out, in one or two plain sentences. */
export function safeToSpendNote(w: Wallet) {
  const perDay = Math.floor(Math.max(0, w.balance - w.upcomingFromWallet) / Math.max(1, w.daysToPayday));
  const left = limitLeft(w);
  const parts = [
    w.upcomingFromWallet > 0
      ? `Your wallet money, less ${amountText(w.upcomingFromWallet, w.currency)} of auto-saves due before payday, shared across the days until then.`
      : "Your wallet money, shared across the days until payday.",
  ];
  if (left !== null && left < perDay) parts.push(left > 0 ? "Your daily limit caps it at what's left today." : "You've reached today's limit. It resets at midnight.");
  return parts.join(" ");
}

/** Why `amount` can't leave the wallet right now (spend, cash out, move), or null when it can. */
export function outgoingProblem(amount: Minor | null, w: Wallet, countsToLimit: boolean): { title: string; body: string } | null {
  if (!amount) return null;
  const left = countsToLimit ? limitLeft(w) : null;
  if (left !== null && amount > left)
    return left > 0
      ? { title: "That's over your daily limit", body: `You can spend ${amountText(left, w.currency)} more today. It resets at midnight.` }
      : { title: "You've reached today's limit", body: `Your daily limit of ${amountText(w.dailyLimit ?? 0, w.currency)} resets at midnight.` };
  if (amount > w.balance) return { title: "More than your wallet has", body: `Your wallet has ${amountText(w.balance, w.currency)}. Try a smaller amount.` };
  return null;
}

export type ActivityDirection = "in" | "out";

const OUT_KINDS = new Set(["move", "auto_save", "spend", "cash_out"]);

/** One wallet movement as a person would say it. Signs follow the wallet: in is +, out is −. */
export function describeActivity(a: WalletActivity): { title: string; detail: string | null; icon: Icon; dir: ActivityDirection; amount: Minor } {
  const amount = Math.abs(a.amount);
  const dir: ActivityDirection = a.amount < 0 || OUT_KINDS.has(a.kind) ? "out" : "in";
  const who = a.counterparty?.trim() || null;
  switch (a.kind) {
    case "top_up":
      return { title: "Added from your bank", detail: null, icon: ArrowDownLeftIcon, dir: "in", amount };
    case "move":
      return { title: who ? `Moved to ${who}` : "Moved to a vault", detail: "Locked in the vault", icon: VaultIcon, dir: "out", amount };
    case "auto_save":
      return { title: who ? `Auto-save to ${who}` : "Auto-save", detail: "Taken from your wallet", icon: RepeatIcon, dir: "out", amount };
    case "spend":
      return { title: who ? `Paid ${who}` : "Payment", detail: a.note?.trim() || null, icon: PaperPlaneRightIcon, dir: "out", amount };
    case "cash_out":
      return { title: "Moved to your bank", detail: null, icon: BankIcon, dir: "out", amount };
    default: {
      const [first, ...rest] = a.memo.split(/\s*·\s*/).filter(Boolean);
      return { title: first || "Money moved", detail: rest.join(" · ") || null, icon: dir === "in" ? ArrowDownLeftIcon : BankIcon, dir, amount };
    }
  }
}

/** Past payees from the wallet, most recent first, for one-tap reuse. */
export function recentPayees(w: Wallet | undefined, max = 6) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of w?.recent ?? []) {
    const p = a.kind === "spend" ? a.counterparty?.trim() : null;
    if (!p || seen.has(p.toLowerCase())) continue;
    seen.add(p.toLowerCase());
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * True when a money move got no answer (it timed out, or the connection dropped): the server may
 * already have made it, so the screen must not say nothing moved or offer the same move again.
 */
export function moveUnconfirmed(e: unknown) {
  return e instanceof ApiError && (e.status === 0 || e.status === 504);
}

/** True when the account is read-only while a person checks a recovery: the wallet can't be shown yet. */
export function walletRestricted(e: unknown) {
  return e instanceof ApiError && e.status === 403 && (e.code === "recovery_restricted" || /being checked/i.test(e.message));
}

export interface MoveBlock {
  code: "kyc_required" | "recovery_restricted";
  title: string;
  body: string;
}

/**
 * A money move the server refused because of the account, not the amount: the ID isn't verified
 * yet (kyc_required) or a recovery is waiting for a person (recovery_restricted). Read from the
 * error's code, or from its words if the code didn't come through.
 */
export function moveBlock(e: unknown): MoveBlock | null {
  if (!(e instanceof ApiError) || e.status !== 403) return null;
  const code =
    e.code === "kyc_required" || e.code === "recovery_restricted"
      ? e.code
      : /verify your id/i.test(e.message)
        ? "kyc_required"
        : /being checked|it'?s you/i.test(e.message)
          ? "recovery_restricted"
          : null;
  if (!code) return null;
  return code === "kyc_required"
    ? { code, title: "Verify your ID first", body: errorMessage(e, "Verify your ID to move money.") }
    : { code, title: "Your account is being checked", body: errorMessage(e, "Money can't move until a person confirms it's you.") };
}
