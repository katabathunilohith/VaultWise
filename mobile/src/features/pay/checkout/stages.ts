import type { StepState, TimelineStep } from "@/components/ui";
import type { PaymentIntent } from "@/lib/api/pay-types";
import type { Stage, StageStatus } from "@/lib/api/types";
import { outcomeOf } from "./outcome-table";

const STATE: Record<StageStatus, StepState> = {
  passed: "done",
  running: "active",
  pending: "pending",
  warning: "warn",
  failed: "failed",
  skipped: "skipped",
};

const SKIPPED_DETAIL = "Not needed — it's a registered merchant";

/**
 * The checkout's release tracker in plain words. Stage names from the server are internal
 * (forensics, audit trail), so each known stage gets a customer-facing title; unknown stages
 * fall back to the server's name.
 */
export function checkoutSteps(intent: PaymentIntent, vaultName: string | null): TimelineStep[] {
  return (intent.stages ?? []).map((s) => step(intent, s, vaultName));
}

function step(intent: PaymentIntent, s: Stage, vaultName: string | null): TimelineStep {
  let state: StepState = STATE[s.status] ?? "pending";
  let title = s.name;
  let detail: string | undefined;
  switch (s.key) {
    case "intake":
      title = "Invoice from a registered merchant";
      break;
    case "preprocess":
      title = "Photo checks";
      break;
    case "extract":
      title = "Line items read";
      if (state === "done") detail = `${intent.lineItems.length} ${intent.lineItems.length === 1 ? "item" : "items"} on the invoice`;
      break;
    case "classify":
      title = vaultName ? `Fits ${vaultName}` : "Fits the vault's purpose";
      if (state === "warn") detail = "One item needs a closer look";
      break;
    case "tamper":
      title = "Not paid before";
      break;
    case "decision": {
      const decision = outcomeOf(intent.status).decision(intent);
      title = decision.title;
      state = decision.state ?? state;
      detail = decision.detail;
      break;
    }
  }
  if (state === "skipped") detail = SKIPPED_DETAIL;
  return { key: s.key, title, detail, state };
}
