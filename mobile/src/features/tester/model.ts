import type { Href } from "expo-router";
import type { TaskId } from "./state";

/** API calls worth counting, and the event each one becomes. */
export const ACTIONS: Record<string, { event: string; task?: TaskId }> = {
  createVault: { event: "vault_created", task: "vault" },
  deposit: { event: "money_added" },
  withdraw: { event: "withdrawal_started" },
  uploadProof: { event: "bill_sent", task: "withdraw" },
  appeal: { event: "decision_appealed" },
  emergencyWithdraw: { event: "emergency_requested", task: "emergency" },
  emergencyReceipt: { event: "receipt_sent" },
  walletTopUp: { event: "wallet_topped_up" },
  walletMove: { event: "wallet_moved_to_vault" },
  walletSpend: { event: "wallet_spent" },
  walletCashOut: { event: "wallet_cashed_out" },
  buyCore: { event: "invested" },
  setSip: { event: "sip_set" },
  confirmCheckout: { event: "checkout_paid" },
  assistant: { event: "assistant_asked" },
  setLimits: { event: "limits_changed" },
};

export const TASKS: { id: TaskId; label: string; href: Href }[] = [
  { id: "vault", label: "Make a vault for something you're saving for", href: "/new-vault" },
  { id: "withdraw", label: "Take money out by showing a bill", href: "/withdraw/choose" },
  { id: "emergency", label: "Ask for emergency money", href: "/emergency" },
];

export const FEEDBACK_HREF = "/tester-feedback" as Href;

/** The System Usability Scale, with "the system" replaced by the app's name. Keep the wording and order: the score depends on them. */
export const SUS_STATEMENTS = [
  "I think I would like to use Vaultwise frequently.",
  "I found Vaultwise unnecessarily complex.",
  "I thought Vaultwise was easy to use.",
  "I think I would need help from a technical person to use Vaultwise.",
  "I found the various parts of Vaultwise worked well together.",
  "I thought there was too much inconsistency in Vaultwise.",
  "I imagine most people would learn to use Vaultwise very quickly.",
  "I found Vaultwise very cumbersome to use.",
  "I felt very confident using Vaultwise.",
  "I needed to learn a lot of things before I could get going with Vaultwise.",
];

export type WouldLock = "yes" | "maybe" | "no";

/** SUS score from 0 to 100. Odd statements score (answer - 1), even ones (5 - answer); the sum is scaled by 2.5. */
export function susScore(answers: number[]) {
  return answers.reduce((sum, a, i) => sum + (i % 2 === 0 ? a - 1 : 5 - a), 0) * 2.5;
}
