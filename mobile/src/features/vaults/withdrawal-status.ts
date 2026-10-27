import type { Tone } from "@/components/ui";
import type { WithdrawalRow, WithdrawalStatus } from "@/lib/api/types";
import { formatDeadline } from "./format";

/**
 * Everything the app decides from a withdrawal's status, one row per status. Raw server strings go
 * through withdrawalStatus() first, so the older "processing" name and new statuses are handled once.
 */

/** Proof is due within 24 hours of a withdrawal request. */
export const PROOF_WINDOW_MS = 24 * 3_600_000;

const KNOWN = ["awaiting_proof", "verifying", "in_review", "appealed", "paid", "denied", "cancelled", "expired"] as const;

/** A status this build knows, or "unknown" for one the server added since. */
export type WithdrawalState = (typeof KNOWN)[number] | "unknown";

/** Waiting for its bill, being checked (automatically or by a person), or finished. */
export type WithdrawalPhase = "needs_bill" | "checking" | "closed";

/** Buttons a row in the vault's withdrawal list offers. */
export type WithdrawalAction = "addBill" | "cancel" | "askPerson";

export interface NoteContext {
  reviewSlaHours: number;
  now?: number;
}

interface StatusRule {
  tone: Tone;
  label: string;
  phase: WithdrawalPhase;
  /** Counts toward the daily withdrawal limit (the server leaves out declined, cancelled and expired). */
  countsTowardDaily: boolean;
  /** Where the withdraw flow picks the request up again ("verifying" also needs its proof). */
  resume: "proof" | "verifying" | null;
  /** The line under the status in the vault's list. */
  note: (row: WithdrawalRow, ctx: NoteContext) => string | null;
  /** What the withdraw flow says when this finished request is opened again. */
  finishedNote?: string;
  actions: (row: WithdrawalRow) => WithdrawalAction[];
}

const none = () => null;
const noActions = (): WithdrawalAction[] => [];

const RULES: Record<WithdrawalState, StatusRule> = {
  awaiting_proof: {
    tone: "warning",
    label: "Awaiting proof",
    phase: "needs_bill",
    countsTowardDaily: true,
    resume: "proof",
    note: (row, { now = Date.now() }) => {
      const due = row.created_at + PROOF_WINDOW_MS;
      return due > now
        ? `Add the bill by ${formatDeadline(due)}.`
        : `The time to add the bill ended at ${formatDeadline(due)}. Cancel it to free the money, or ask a person.`;
    },
    // A request with a proof already has its bill, so it can only be cancelled.
    actions: (row) => (row.proof_id ? ["cancel"] : ["addBill", "cancel"]),
  },
  verifying: {
    tone: "info",
    label: "Checking",
    phase: "checking",
    countsTowardDaily: true,
    resume: "verifying",
    note: () => "Checking the bill now. This usually takes a few seconds.",
    actions: noActions,
  },
  in_review: {
    tone: "info",
    label: "With a person",
    phase: "checking",
    countsTowardDaily: true,
    resume: "verifying",
    note: (_, { reviewSlaHours }) => `A person is checking the bill, usually within ${reviewSlaHours} hours.`,
    actions: noActions,
  },
  appealed: {
    tone: "info",
    label: "With a person",
    phase: "checking",
    countsTowardDaily: true,
    resume: "verifying",
    note: (_, { reviewSlaHours }) =>
      `You asked a person to check it again. You'll usually hear back within ${reviewSlaHours} hours. The money stays held until then.`,
    actions: noActions,
  },
  paid: {
    tone: "success",
    label: "Paid",
    phase: "closed",
    countsTowardDaily: true,
    resume: null,
    note: none,
    finishedNote: "This withdrawal has already been paid.",
    actions: noActions,
  },
  denied: {
    tone: "danger",
    label: "Not approved",
    phase: "closed",
    countsTowardDaily: false,
    // A declined request can't take another bill: the flow starts a fresh one for the same amount.
    resume: "proof",
    note: (row) =>
      `${row.decision_reason ? `${row.decision_reason} ` : ""}${row.proof_id ? "Open it to add another bill or ask a person to check." : "Ask a person to check."}`,
    // With a proof, its tracker has the ways forward.
    actions: (row) => (row.proof_id ? [] : ["askPerson"]),
  },
  cancelled: {
    tone: "neutral",
    label: "Cancelled",
    phase: "closed",
    countsTowardDaily: false,
    resume: null,
    note: none,
    finishedNote: "This withdrawal was cancelled, so the money stayed in the vault.",
    actions: noActions,
  },
  expired: {
    tone: "neutral",
    label: "Expired",
    phase: "closed",
    countsTowardDaily: false,
    resume: null,
    note: () => "No bill arrived within 24 hours, so the money stayed in this vault.",
    finishedNote: "No bill arrived in time, so this withdrawal closed and the money stayed in the vault.",
    actions: noActions,
  },
  unknown: {
    tone: "neutral",
    label: "", // the raw status, see withdrawalRule()
    phase: "closed",
    countsTowardDaily: true,
    resume: null,
    note: none,
    actions: noActions,
  },
};

/** Older servers call the automatic check "processing". */
const ALIASES: Partial<Record<string, WithdrawalState>> = { processing: "verifying" };

function isKnown(raw: string): raw is (typeof KNOWN)[number] {
  return (KNOWN as readonly string[]).includes(raw);
}

/** A raw server status as one this build knows ("processing" → "verifying"; anything new → "unknown"). */
export function withdrawalStatus(raw: WithdrawalStatus): WithdrawalState {
  return isKnown(raw) ? raw : (ALIASES[raw] ?? "unknown");
}

/** The rule for a raw status. An unknown one shows its own name ("on_hold" → "on hold"). */
export function withdrawalRule(raw: WithdrawalStatus): StatusRule {
  const state = withdrawalStatus(raw);
  return state === "unknown" ? { ...RULES.unknown, label: raw.replace(/_/g, " ") } : RULES[state];
}

/** Still holding money: waiting for its bill or a check. Pending requests list first. */
export function isPending(raw: WithdrawalStatus) {
  return RULES[withdrawalStatus(raw)].phase !== "closed";
}

/** Where the withdraw flow picks up an existing request, or null when there's nothing left to do. */
export function resumeTarget(row: Pick<WithdrawalRow, "status" | "proof_id">): "proof" | "verifying" | null {
  const target = withdrawalRule(row.status).resume;
  // Following a check needs the proof being checked.
  return target === "verifying" && !row.proof_id ? null : target;
}
