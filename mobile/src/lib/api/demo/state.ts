/**
 * The simulator's state: a copy of the snapshot (src/data/fixtures) that this session's actions
 * change, and the ledger helpers every part of the simulator moves money with.
 */
import activityFx from "@/data/fixtures/activity.json";
import dashboardFx from "@/data/fixtures/dashboard.json";
import emergencyFx from "@/data/fixtures/emergency.json";
import limitsFx from "@/data/fixtures/limits.json";
import meFx from "@/data/fixtures/me.json";
import detailFx from "@/data/fixtures/vault-detail.json";
import vaultsFx from "@/data/fixtures/vaults.json";
import type { PlanFrequency } from "../../invest";
import { ApiError } from "../errors";
import type { Activity, Dashboard, EmergencyOverview, JournalLine, LimitsOverview, MeOnboarded, Millis, Minor, Vault, VaultDetail, WithdrawalRow } from "../types";
import { freshWallet, type WalletState } from "./wallet-state"; // wallet
import { freshIdentity, type DemoIdentity } from "./identity-state"; // identity

export const DAY = 86_400_000;
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const newId = (prefix: string) => `${prefix}_demo${Math.random().toString(36).slice(2, 10)}`;
export const toMinor = (major: number) => Math.round(major * 100);
export const PERIOD: Record<string, number> = { weekly: 7 * DAY, biweekly: 14 * DAY, monthly: 30 * DAY };

type Journal = Activity["journals"][number];
type Recent = Dashboard["recent"][number];

/** This session's Core plan change and buys, laid over the snapshot by investCore. */
export interface InvestState {
  /** The plan as last saved, or "stopped"; null while the snapshot's own plan stands. */
  plan: { amount: Minor; frequency: PlanFrequency; nextRunAt: Millis } | "stopped" | null;
  buys: Minor[];
}

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
  invest: InvestState;
  wallet: WalletState; // wallet
  identity: DemoIdentity; // identity
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
    invest: { plan: null, buys: [] },
    wallet: freshWallet(), // wallet
    identity: freshIdentity(), // identity
  };
}

/** The live state. Its fields are replaced, never the object, so every module sees a reset. */
export const S: State = fresh();
export const currency = S.me.user.currency;

/** Back to the snapshot (Settings → Delete account in Practice). */
export function resetState() {
  Object.assign(S, fresh());
}

export function recompute(v: Vault) {
  v.available = Math.max(0, v.balance - v.held);
  v.progress = v.target > 0 ? Math.min(1, v.balance / v.target) : 0;
  if (v.targetDate) {
    const months = Math.max(1, (new Date(v.targetDate).getTime() - Date.now()) / (30 * DAY));
    v.monthlyNeeded = Math.max(0, Math.round((v.target - v.balance) / months));
  }
}

export function findVault(vaultId: string) {
  const v = S.vaults.find((x) => x.id === vaultId);
  if (!v) throw new ApiError("Vault not found", 404);
  return v;
}

/**
 * Records a money movement everywhere the UI reads it: the vault's history, the activity feed
 * and the dashboard's recent list (unsigned amounts there, as the server returns them).
 */
export function record(kind: string, memo: string, vault: Vault | null, vaultDelta: number, counterparty: { account: string; kind: string }) {
  const now = Date.now();
  const jid = newId("jnl");
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
export function journal(jid: string, kind: string, memo: string, at: number, entries: Journal["entries"]) {
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
export function withdrawnToday() {
  const since = startOfToday();
  return [...S.withdrawals.values()]
    .flat()
    .filter((w) => w.created_at >= since && w.status !== "denied" && w.status !== "cancelled" && w.status !== "expired")
    .reduce((s, w) => s + w.amount, 0);
}

/** The emergency cap actually applied: the stricter of the market cap and the personal limit. */
export function applyEmergencyCap() {
  const cap = Math.min(S.emergency.marketCap, S.limits.limits.monthlyEmergency);
  S.emergency = { ...S.emergency, cap, remainingCap: Math.max(0, cap - S.emergency.usedThisMonth) };
}

export function limitsView(): LimitsOverview {
  const today = withdrawnToday();
  return clone({ ...S.limits, usage: { withdrawnToday: today, dailyRemaining: Math.max(0, S.limits.limits.dailyWithdrawal - today) } });
}

/** Withdrawal statuses the server counts as waiting on a check or a person (and keeps held). */
export const PENDING_REVIEW = new Set(["verifying", "in_review", "appealed"]);
