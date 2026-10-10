import { categoryOf } from "@/lib/categories";
import type { ProofView } from "@/lib/api/types";
import { lowerFirst } from "./format";

/**
 * Turns a verification into the three outcomes people see, and a declined verification into ONE
 * plain reason plus what to do next. Copy rules (DESIGN.md §5): describe the document, never the
 * person; no internal terms (confidence, thresholds, models); a next step and a human every time.
 */

export type Outcome = "approved" | "review" | "declined";

export function outcomeOf(v: ProofView["verification"] | undefined | null): Outcome | null {
  if (!v) return null;
  // A decline that was appealed is back with a person, whatever the automatic check said.
  if (v.finalDecision === "appealed") return "review";
  // The pipeline hit a problem and handed the bill to a person (the server marks it "error").
  if (v.status === "error") return "review";
  if (v.status !== "complete") return null;
  if (v.finalDecision === "approved") return "approved";
  if (v.finalDecision === "denied") return "declined";
  if (v.decision === "auto_approved") return "approved";
  if (v.decision === "auto_denied") return "declined";
  // No final decision yet: the automatic check handed it to a person.
  return "review";
}

/** When a person will have looked at it: the queue time (or now) plus the review window. */
export function reviewDueAt(proof: ProofView, slaHours: number, fallbackNow: number) {
  const start = proof.verification.queuedAt ?? proof.verification.decidedAt ?? fallbackNow;
  return start + slaHours * 3_600_000;
}

export type DeclineKind = "unreadable" | "reused" | "edited" | "age" | "amount" | "name" | "purpose" | "other";

interface Signals {
  failedStages: Set<string>;
  warnStages: Set<string>;
  /** Labels of checks that failed (or warned), lower-cased. */
  failedChecks: string[];
  warnChecks: string[];
  reasons: string;
}

function signalsOf(proof: ProofView): Signals {
  const failedStages = new Set<string>();
  const warnStages = new Set<string>();
  const failedChecks: string[] = [];
  const warnChecks: string[] = [];
  for (const s of proof.verification.stages) {
    if (s.status === "failed") failedStages.add(s.key);
    if (s.status === "warning") warnStages.add(s.key);
    for (const c of s.checks) {
      const text = `${c.label} ${c.detail}`.toLowerCase();
      if (c.status === "fail") failedChecks.push(text);
      if (c.status === "warn") warnChecks.push(text);
    }
  }
  return { failedStages, warnStages, failedChecks, warnChecks, reasons: proof.verification.reasons.join(" ").toLowerCase() };
}

const has = (list: string[], re: RegExp) => list.some((t) => re.test(t));

/**
 * The single most useful reason, in priority order: a file we couldn't read makes every other
 * check meaningless; reuse and editing are about the document itself; then the fixable details.
 */
export function declineKind(proof: ProofView, opts: { demo?: boolean } = {}): DeclineKind {
  const s = signalsOf(proof);
  const all = [...s.failedChecks, ...s.warnChecks];
  // The demo simulator reports the same stage results for every declined sample, so its file
  // name is the only thing that tells a purpose mismatch from an edited file there.
  if (opts.demo && proof.fileName) {
    if (/coffee/i.test(proof.fileName)) return "purpose";
    if (/tamper|edited/i.test(proof.fileName)) return "edited";
  }
  if (s.failedStages.has("extract") || has(s.failedChecks, /document detected|legib|unreadable|not a document/) || /couldn.t read|legib|blurr|not a document/.test(s.reasons))
    return "unreadable";
  if (has(s.failedChecks, /duplicate|reuse|seen before|used before/) || /duplicate|reuse|used before/.test(s.reasons)) return "reused";
  if (s.failedStages.has("tamper") || has(s.failedChecks, /error level|edit|alter|tamper/) || /edit|tamper|alter/.test(s.reasons)) return "edited";
  if (has(all, /document date|too old|older than/) || /too old|older than|document date/.test(s.reasons)) return "age";
  if (has(all, /amount covered|total/) || /amount|total|less than/.test(s.reasons)) return "amount";
  if (has(all, /name on document/) || /\bname\b/.test(s.reasons)) return "name";
  if (s.failedStages.has("classify") || s.warnStages.has("classify") || has(all, /purpose/) || /purpose|match/.test(s.reasons)) return "purpose";
  return "other";
}

export interface DeclineCopy {
  kind: DeclineKind;
  reason: string;
  next: string;
}

/** One plain reason and the next step, for a withdrawal proof or an emergency receipt. */
export function declineCopy(
  proof: ProofView,
  ctx: { vaultName?: string | null; category?: string | null; amountText?: string | null; maxDocAgeDays: number; demo?: boolean },
): DeclineCopy {
  const kind = declineKind(proof, { demo: ctx.demo });
  const vault = ctx.vaultName ?? "This vault";
  const meta = categoryOf(ctx.category ?? proof.category);
  switch (kind) {
    case "unreadable":
      return { kind, reason: "We couldn't read this file clearly.", next: "Take a new photo in good light, with the whole bill inside the frame." };
    case "reused":
      return { kind, reason: "This bill has already been used for a payout.", next: "Each bill covers one withdrawal. Add a different one, or ask a person to check." };
    case "edited":
      return { kind, reason: "This file looks edited.", next: "Quickest fix: download the original from your provider's email or app." };
    case "age":
      return {
        kind,
        reason: `This bill is more than ${ctx.maxDocAgeDays} days old.`,
        next: `${vault} covers bills from the last ${ctx.maxDocAgeDays} days. Add a newer one, or ask a person to check.`,
      };
    case "amount":
      return {
        kind,
        reason: ctx.amountText ? `The bill's total is less than ${ctx.amountText}.` : "The bill's total is less than the amount asked for.",
        next: "Add a bill that covers the full amount, or ask a person to check.",
      };
    case "name":
      return { kind, reason: "The name on the bill isn't yours or a dependant's.", next: "Add a bill in your name, or ask a person to check." };
    case "purpose":
      return {
        kind,
        reason: `This doesn't look like a ${meta.short.toLowerCase()} bill.`,
        next: `Add ${lowerFirst(meta.proofHint)}, or ask a person to check.`,
      };
    default:
      return { kind, reason: "This document doesn't support the request.", next: "Try another document, or ask a person to check." };
  }
}
