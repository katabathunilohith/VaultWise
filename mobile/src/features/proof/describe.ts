import type { Tone } from "@/components/ui";
import type { ProofView } from "@/lib/api/types";
import { money, moneyWhole } from "@/lib/money";
import { whenText } from "./format";
import { declineCopy, outcomeOf, reviewDueAt, type DeclineCopy, type Outcome } from "./verdict";

/** "₹840" for whole amounts, "₹84.20" otherwise. */
export function amountText(minor: number, currency: string) {
  return minor % 100 === 0 ? moneyWhole(minor, currency) : money(minor, currency);
}

export interface ProofContext {
  vaultName: string;
  category: string;
  currency: string;
  /** Minor units; null for an emergency receipt. */
  amount: number | null;
  maxDocAgeDays: number;
  reviewSlaHours: number;
  now: number;
  demo?: boolean;
}

export interface ProofDescription {
  outcome: Outcome | null;
  headline: string;
  lines: string[];
  pill: { tone: Tone; label: string };
  reviewBy: string | null;
  /** The review is past the time we gave. */
  reviewLate: boolean;
  decline: DeclineCopy | null;
}

/** Outcome first, then the number; one plain reason; exact times. Shared by the flow and the tracker. */
export function describeProof(proof: ProofView, ctx: ProofContext): ProofDescription {
  const outcome = outcomeOf(proof.verification);
  const receipt = proof.purpose === "emergency_receipt";
  const amt = ctx.amount !== null ? amountText(ctx.amount, ctx.currency) : null;
  const base = { outcome, reviewBy: null, reviewLate: false, decline: null };

  if (!outcome)
    return {
      ...base,
      headline: receipt ? "Checking your receipt" : "Checking your bill",
      lines: ["Usually done in a few seconds."],
      pill: { tone: "info", label: "Checking" },
    };

  if (outcome === "approved")
    return {
      ...base,
      headline: receipt ? "Receipt accepted." : "Paid.",
      lines: receipt
        ? ["Nothing else to do for this emergency payout."]
        : [amt ? `${amt} is heading to your bank, covered by ${ctx.vaultName}.` : `Paid to your bank, covered by ${ctx.vaultName}.`],
      pill: { tone: "success", label: receipt ? "Accepted" : "Paid" },
    };

  if (outcome === "review") {
    const due = reviewDueAt(proof, ctx.reviewSlaHours, ctx.now);
    const by = whenText(due, ctx.now);
    const late = due < ctx.now;
    const held = receipt ? "Your emergency payout isn't affected." : amt ? `Your ${amt} stays set aside meanwhile.` : "The money stays set aside meanwhile.";
    return {
      ...base,
      reviewBy: by,
      reviewLate: late,
      headline: "A person's taking a look.",
      lines: late ? [`We said you'd hear back by ${by}. It's taking longer than it should.`, `${held} Talk to a person and we'll chase it.`] : [`You'll hear back by ${by}.`, held],
      pill: { tone: "warning", label: "With a person" },
    };
  }

  const decline = declineCopy(proof, {
    vaultName: ctx.vaultName,
    category: ctx.category,
    amountText: amt,
    maxDocAgeDays: ctx.maxDocAgeDays,
    demo: ctx.demo,
  });
  return {
    ...base,
    decline,
    headline: receipt ? "We couldn't accept this receipt." : "We couldn't approve this.",
    lines: [decline.reason, decline.next],
    pill: { tone: "danger", label: receipt ? "Not accepted" : "Not approved" },
  };
}
