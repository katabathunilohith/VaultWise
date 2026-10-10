import type { PaymentIntent } from "@/lib/api/pay-types";
import type { Minor, Vault, VaultCategory } from "@/lib/api/types";
import { categoryOf } from "@/lib/categories";

export type PayVault = PaymentIntent["eligibleVaults"][number];

export interface VaultOption extends PayVault {
  /** Why this vault can't pay, in plain words; null when it can. */
  disabledReason: string | null;
}

function byAvailable(intent: PaymentIntent) {
  return [...intent.eligibleVaults].sort((a, b) => b.available - a.available);
}

/** The vault the customer picked, or the eligible vault with the most available. */
export function selectedVault(intent: PaymentIntent, choiceId: string | null): PayVault | null {
  return intent.eligibleVaults.find((v) => v.id === choiceId) ?? byAvailable(intent)[0] ?? null;
}

/** The vault that paid (after confirming). */
export function payingVault(intent: PaymentIntent, fallback: PayVault | null): PayVault | null {
  return fallback?.id === intent.vaultId ? fallback : (intent.eligibleVaults.find((v) => v.id === intent.vaultId) ?? fallback);
}

/**
 * What's left in the paying vault after this payment. When the payment was confirmed on this
 * screen, it's worked out from the balance seen at confirmation (the first "succeeded" response
 * can still carry the pre-payment balance); otherwise it's the intent's latest balance.
 */
export function remainingAfter(intent: PaymentIntent, paidFrom: PayVault | null): Minor | null {
  if (paidFrom) return Math.max(0, paidFrom.available - intent.amount);
  return intent.eligibleVaults.find((v) => v.id === intent.vaultId)?.available ?? null;
}

function covers(v: Vault, category: VaultCategory) {
  return v.category === category || (v.category === "custom" && v.template === category);
}

/** The vault bill category in running text: "health bills". */
export function billWord(category: VaultCategory) {
  return category === "custom" ? "these" : categoryOf(category).label.toLowerCase();
}

/**
 * Everything the picker lists: eligible vaults first (most available first), then the customer's
 * other vaults, shown disabled with the reason they can't pay this bill.
 */
export function vaultOptions(intent: PaymentIntent, all: Vault[] | undefined): VaultOption[] {
  const eligibleIds = new Set(intent.eligibleVaults.map((v) => v.id));
  const eligible: VaultOption[] = byAvailable(intent).map((v) => ({
    ...v,
    disabledReason: v.available < intent.amount ? "Not enough available" : null,
  }));
  const others: VaultOption[] = (all ?? [])
    .filter((v) => !eligibleIds.has(v.id) && !covers(v, intent.category))
    .map((v) => ({
      id: v.id,
      name: v.name,
      category: v.category,
      available: v.available,
      disabledReason: `Doesn't cover ${billWord(intent.category)} bills`,
    }));
  return [...eligible, ...others];
}
