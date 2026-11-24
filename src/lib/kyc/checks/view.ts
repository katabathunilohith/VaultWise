import { parseJson } from "../../db";
import { flowFor } from "./config";
import { currentProviderNames } from "./registry";
import { latestCheck, resetAt, type CheckRow } from "./store";
import type { CheckStep, KycSteps, StepStatus, StepView } from "./types";

/**
 * Read-only: where each step is. Used by the KYC view (src/lib/kyc/service.ts), so it must not import
 * the KYC service back (checks/service.ts does the writing).
 */

export const STEPS: CheckStep[] = ["pan", "aadhaar", "bank"];

export interface StepsState {
  rows: Record<CheckStep, CheckRow | undefined>;
  steps: KycSteps;
  reasons: string[];
  updatedAt: number | null;
}

/**
 * A step's status from its newest try. Until the account is verified, a try made with another provider
 * than the one that runs the step now counts as not done (`todo`), so steps finished with the test
 * provider's sample data don't carry over when a server switches to a real provider. A verified account
 * keeps its steps as they were: that decision is already made.
 */
function statusOf(row: CheckRow | undefined, verified: boolean, provider: string): StepStatus {
  if (!row || row.status === "started" || row.status === "expired") return "todo";
  if (!verified && row.provider !== provider) return "todo";
  // Once a person approved the whole check, a step they looked at counts as done.
  if (row.status === "review" && verified) return "done";
  return row.status;
}

/** The current state of the three steps (tries before the last rejection don't count). */
export function stepsState(user: { id: string; kyc_status: string }): StepsState {
  const since = resetAt(user.id);
  const verified = user.kyc_status === "verified";
  const providers = currentProviderNames();
  const rows = {} as Record<CheckStep, CheckRow | undefined>;
  const steps = {} as KycSteps;
  const reasons: string[] = [];
  let updatedAt: number | null = null;
  for (const step of STEPS) {
    const row = latestCheck(user.id, step, since);
    rows[step] = row;
    const status = statusOf(row, verified, providers[step]);
    const view: StepView = { status };
    if (row?.last4 && status !== "todo") view.last4 = row.last4;
    steps[step] = view;
    if (row && (status === "review" || status === "failed")) reasons.push(...parseJson<string[]>(row.reasons, []));
    if (row && status !== "todo") updatedAt = Math.max(updatedAt ?? 0, row.updated_at);
  }
  return { rows, steps, reasons, updatedAt };
}

/**
 * True while a step since the last rejection has compared the account's name with a document (done or
 * waiting for a person). The name must then stay as it is, or three steps could each match a different
 * name (and person). A rejection starts the steps again and frees the name.
 */
export function stepsHoldName(user: { id: string; kyc_status: string; jurisdiction: string }): boolean {
  if (flowFor(user) !== "steps") return false;
  const s = stepsState(user);
  return STEPS.some((k) => s.steps[k].status === "done" || s.steps[k].status === "review");
}

/** The extra fields GET /api/v1/kyc carries in the steps flow, or null in the photo flow. */
export function stepsView(user: { id: string; kyc_status: string; jurisdiction: string }): { flow: "steps"; steps: KycSteps; reasons: string[]; updatedAt: number | null } | null {
  if (flowFor(user) !== "steps") return null;
  const s = stepsState(user);
  return { flow: "steps", steps: s.steps, reasons: s.reasons, updatedAt: s.updatedAt };
}
