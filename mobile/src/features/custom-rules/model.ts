import type { CustomRule, VaultCategory } from "@/lib/api/types";

/** The server's limits (lib/custom-rules.ts in the web app), so a rule is never rejected there. */
export const LIMITS = { maxUses: 5, useMin: 2, useMax: 60, proofMin: 4, proofMax: 120 } as const;

/** Ideas offered as one-tap additions. */
export const USE_IDEAS = ["Venue and catering", "Flights", "Course fees", "Equipment", "Vet bills", "Car repairs"];

export interface OwnRuleDraft {
  uses: string[];
  proof: string;
}

export const emptyDraft: OwnRuleDraft = { uses: [], proof: "" };

/** Tidies a typed item; null if it's too short to keep. */
export function cleanUse(text: string): string | null {
  const t = text.trim().replace(/\s+/g, " ").slice(0, LIMITS.useMax);
  return t.length >= LIMITS.useMin ? t : null;
}

/** Adds an item unless it's a duplicate or the list is full. */
export function addUse(draft: OwnRuleDraft, text: string): OwnRuleDraft {
  const item = cleanUse(text);
  if (!item || draft.uses.length >= LIMITS.maxUses) return draft;
  if (draft.uses.some((u) => u.toLowerCase() === item.toLowerCase())) return draft;
  return { ...draft, uses: [...draft.uses, item] };
}

export function removeUse(draft: OwnRuleDraft, item: string): OwnRuleDraft {
  return { ...draft, uses: draft.uses.filter((u) => u !== item) };
}

export function draftValid(draft: OwnRuleDraft) {
  return draft.uses.length > 0 && draft.proof.trim().length >= LIMITS.proofMin;
}

/** The request body field, or null while the draft is incomplete. */
export function toCustomRule(draft: OwnRuleDraft): CustomRule | null {
  return draftValid(draft) ? { uses: draft.uses, proof: draft.proof.trim().slice(0, LIMITS.proofMax) } : null;
}

/**
 * What "How this vault unlocks" lists under "With a matching bill" for a custom vault. Null means
 * "use the category's own list" (any other vault, or a custom vault that borrows a category).
 */
export function customUnlock(
  category: VaultCategory | string,
  template: VaultCategory | string | null | undefined,
  rule: CustomRule | null | undefined,
  opts: { enabled: boolean; reviewSlaHours: number },
): { items: string[]; note: string } | null {
  if (category !== "custom") return null;
  if (rule) {
    return {
      items: rule.uses,
      note: `Proof you'll show: ${rule.proof}. A person checks every withdrawal against your rule, usually within ${opts.reviewSlaHours} hours.`,
    };
  }
  const borrows = !!template && template !== "custom";
  if (borrows || !opts.enabled) return null;
  return {
    items: ["Whatever your own rule allows: you write what it can pay for", "Or the same bills as a category you borrow"],
    note: "With your own rule, a person checks every withdrawal against it. Borrowed rules are checked the same way as that category.",
  };
}
