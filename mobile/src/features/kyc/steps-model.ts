/**
 * kyc-checks (plan 07): the onboarding steps in plain logic, no UI. PAN, then Aadhaar through
 * DigiLocker, then a bank account by reverse penny drop. The server decides; this only reads its view.
 */
import { ApiError } from "@/lib/api/errors";
import { maskId, normaliseId, validateIdNumber } from "@/lib/api/identity-ids";
import type { KycStep, KycStepName, KycSteps } from "@/lib/api/identity-types";

export const STEP_ORDER: KycStepName[] = ["pan", "aadhaar", "bank"];

export const STEP_TITLES: Record<KycStepName, string> = {
  pan: "PAN",
  aadhaar: "Aadhaar through DigiLocker",
  bank: "Bank account",
};

/** Every step still to do: what a Practice re-run shows until the PAN's answer comes back. */
export const ALL_TODO: KycSteps = {
  pan: { status: "todo", last4: null },
  aadhaar: { status: "todo", last4: null },
  bank: { status: "todo", last4: null },
};

/**
 * The test provider's sample PANs (docs/plans/contracts.md). Offered in Practice only, where the
 * simulator answers like the test provider: the first passes, the second goes to a pretend person.
 */
export const PRACTICE_PAN = "ABCDE1234F";
export const PRACTICE_PAN_MISMATCH = "ABCDE0000F";

/** A step is finished once it's done or with a person; the next one can start then. */
export const isFinished = (s: KycStep) => s.status === "done" || s.status === "review";

/** The step to do now: the first one not finished (todo, or failed and to try again). Null when all are. */
export function currentStep(steps: KycSteps): KycStepName | null {
  return STEP_ORDER.find((name) => !isFinished(steps[name])) ?? null;
}

export function finishedCount(steps: KycSteps) {
  return STEP_ORDER.filter((name) => isFinished(steps[name])).length;
}

/** True when any step was done at all, so the status screen shows the steps rather than an ID. */
export function anyStepStarted(steps: KycSteps | null) {
  return !!steps && STEP_ORDER.some((name) => steps[name].status !== "todo");
}

/** How the number is shown: PAN ••••234F, Aadhaar •••• •••• 1234, bank account ••••4321. */
export function stepNumber(name: KycStepName, last4: string | null) {
  return maskId(name, last4);
}

/** What a screen reader says instead of the dots: "ending in 2 3 4 F". */
export function spokenStepNumber(last4: string | null) {
  return last4 ? `ending in ${last4.split("").join(" ")}` : "";
}

export type PanCheck = { ok: true; pan: string } | { ok: false; reason: string };

/** The PAN's format (5 letters, 4 digits, a letter), checked with the server's rule before sending. */
export function checkPan(raw: string): PanCheck {
  if (!normaliseId(raw)) return { ok: false, reason: "Type your PAN." };
  const v = validateIdNumber("pan", raw);
  return v.ok ? { ok: true, pan: v.number } : { ok: false, reason: "A PAN has 10 characters: 5 letters, 4 digits, then a letter." };
}

/** DigiLocker or the ₹1 payment isn't finished yet: the try stays open, and finishing can be tried again. */
export const isStepWaiting = (e: unknown) => e instanceof ApiError && e.code === "kyc_step_waiting";

/** The DigiLocker visit or the ₹1 payment link is no longer valid: start the step again. */
export const isTryGone = (e: unknown) => e instanceof ApiError && (e.code === "kyc_request_expired" || e.code === "kyc_request_not_found");

/**
 * The server sees the check elsewhere than this screen does (done on another phone, already decided,
 * switched to the photo check): the view is fetched again so the screen catches up.
 */
const OUT_OF_STEP = new Set(["kyc_done", "kyc_in_review", "kyc_flow_off", "kyc_step_done", "kyc_step_order"]);
export const isOutOfStep = (e: unknown) => e instanceof ApiError && !!e.code && OUT_OF_STEP.has(e.code);

/** The provider is down for now (503): nothing changed, try later. */
export const isProviderDown = (e: unknown) => e instanceof ApiError && (e.code === "provider_unavailable" || e.status === 503);
