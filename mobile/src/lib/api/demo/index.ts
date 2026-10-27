/**
 * Practice mode: the same API as the live server (it `satisfies Api`), backed by a snapshot of real
 * responses (src/data/fixtures) and simulations of the parts that move — deposits, the proof
 * pipeline, the emergency cascade, Core buys and Pay with Vaultwise. It mirrors the server's rules
 * where they matter to the UI (one proof per withdrawal, Tier 2 safety pause, weekly request limit).
 * State lives in memory and resets when the app restarts or on reset().
 */
import accountsFx from "@/data/fixtures/accounts.json";
import activityFx from "@/data/fixtures/activity.json";
import badgesFx from "@/data/fixtures/badges.json";
import dashboardFx from "@/data/fixtures/dashboard.json";
import insightFx from "@/data/fixtures/insight.json";
import type { Api } from "../client";
import type { PaymentIntent } from "../pay-types";
import { DEMO_SAMPLES } from "../samples";
import type { Accounts, Activity, BadgesResponse, Dashboard, Insight, Me, OnboardingInput } from "../types";
import { emergencyApi, refreshEmergency } from "./emergency";
import { investApi } from "./invest";
import { appealProof, proofById, resetProofs } from "./proofs";
import { checkouts, settleDue } from "./settle";
import { clone, PENDING_REVIEW, resetState, S, wait } from "./state";
import { vaultsApi } from "./vaults";
import { assertPracticeCanMove, identityDemo, withIdentity } from "./identity";
import { walletDemo } from "./wallet";

export const demo = {
  ...walletDemo, // wallet
  ...identityDemo, // identity
  me: async (): Promise<Me> => withIdentity(clone(S.me)), // identity: auth, kyc and recovery fields
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
      // wallet: the spending balance counts toward net worth, as on the server.
      totals: { ...S.totals, saved, wallet: S.wallet.balance, netWorth: saved + S.totals.bank + S.totals.invested + S.wallet.balance },
      recent: clone(S.recent),
      emergency: { ...fx.emergency, cap: S.emergency.cap, remainingCap: S.emergency.remainingCap, receiptsDue },
      reviewPending,
    };
  },
  ...vaultsApi,
  proof: async (proofId: string) => proofById(proofId),
  appeal: async (proofId: string, note: string) => {
    await wait(400);
    settleDue();
    appealProof(proofId, note);
    return { ok: true as const };
  },
  ...emergencyApi,
  ...investApi,
  region: async () => ({ guess: { country: "IN", supported: true, source: "demo", detail: "Demo data is set in India" } }),
  reset: async () => {
    await wait(400);
    resetState();
    resetProofs();
    checkouts.reset();
    return { ok: true as const };
  },
  /** There's no server to export from in Practice. */
  exportUrl: () => null,
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
  // The simulator reads only an upload's file name, so a sample needs no real address.
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
    return checkouts.view(intentId);
  },
  confirmCheckout: async (intentId: string, vaultId: string, pin: string): Promise<PaymentIntent> => {
    assertPracticeCanMove(); // identity: read-only while a Practice recovery request waits
    await wait(300);
    settleDue();
    return checkouts.confirm(intentId, vaultId, pin);
  },
  payIntents: async (): Promise<PaymentIntent[]> => {
    // Catches every checkout up (checks done, reviews finished) before deciding whether to refill.
    settleDue();
    return checkouts.list();
  },
} satisfies Api;
