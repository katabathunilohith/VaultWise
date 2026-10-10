import type { StepState, TimelineStep } from "@/components/ui";
import type { ProofView, Stage, StageStatus } from "@/lib/api/types";
import { whenText } from "./format";
import type { Outcome } from "./verdict";

/**
 * Maps the server's six verification stages onto the release tracker people read. Plain names
 * only: never confidence, scores, thresholds or model names.
 */

const STATE: Record<StageStatus, StepState> = {
  pending: "pending",
  running: "active",
  passed: "done",
  warning: "warn",
  failed: "failed",
  skipped: "skipped",
};

function groupState(stages: Stage[]): StepState {
  if (!stages.length) return "pending";
  const st = stages.map((s) => s.status);
  if (st.includes("failed")) return "failed";
  const finished = (s: StageStatus) => s === "passed" || s === "warning" || s === "skipped";
  if (st.every(finished)) {
    if (st.includes("warning")) return "warn";
    return st.every((s) => s === "skipped") ? "skipped" : "done";
  }
  if (st.some((s) => s === "running" || finished(s))) return "active";
  return "pending";
}

function lastFinished(stages: Stage[]) {
  const times = stages.map((s) => s.finishedAt ?? 0).filter(Boolean);
  return times.length ? Math.max(...times) : undefined;
}

function finalTitle(purpose: ProofView["purpose"], outcome: Outcome | null) {
  if (purpose === "emergency_receipt") {
    if (outcome === "approved") return "Receipt accepted";
    if (outcome === "review") return "With a person";
    if (outcome === "declined") return "Not accepted";
    return "Deciding";
  }
  if (outcome === "approved") return "Paid out";
  if (outcome === "review") return "With a person";
  if (outcome === "declined") return "Not approved";
  return "Paying out";
}

/**
 * The four-step tracker used while verifying and in the compact track sheet:
 * Reading your bill (intake + preprocess + extract) → Matching it to {vault} (classify) →
 * Checking it's genuine (tamper) → Paying out (decision).
 */
export function trackerSteps(
  proof: ProofView,
  opts: { vaultName: string; outcome: Outcome | null; withTimes?: boolean; reviewBy?: string | null; reviewLate?: boolean; now?: number },
): TimelineStep[] {
  const by = new Map(proof.verification.stages.map((s) => [s.key, s]));
  const pick = (keys: string[]) => keys.map((k) => by.get(k)).filter((s): s is Stage => !!s);
  const groups: { key: string; title: string; stages: Stage[] }[] = [
    { key: "read", title: proof.purpose === "emergency_receipt" ? "Reading your receipt" : "Reading your bill", stages: pick(["intake", "preprocess", "extract"]) },
    { key: "match", title: proof.purpose === "emergency_receipt" ? "Matching it to the emergency" : `Matching it to ${opts.vaultName}`, stages: pick(["classify"]) },
    { key: "genuine", title: "Checking it's genuine", stages: pick(["tamper"]) },
    { key: "decide", title: finalTitle(proof.purpose, opts.outcome), stages: pick(["decision"]) },
  ];
  const steps: TimelineStep[] = groups.map((g) => {
    const t = lastFinished(g.stages);
    return {
      key: g.key,
      title: g.title,
      state: groupState(g.stages),
      time: opts.withTimes && t ? whenText(t, opts.now) : undefined,
    };
  });
  const last = steps[steps.length - 1];
  if (opts.outcome === "approved") last.state = "done";
  if (opts.outcome === "declined") last.state = "failed";
  if (opts.outcome === "review") {
    last.state = "active";
    last.time = undefined;
    last.detail = !opts.reviewBy
      ? "A person on our team is checking it."
      : opts.reviewLate
        ? `We said by ${opts.reviewBy}. It's taking longer than it should.`
        : `You'll hear back by ${opts.reviewBy}.`;
  }
  // Queued and nothing started yet: show that the first step is under way.
  if (!opts.outcome && steps.every((s) => s.state === "pending")) steps[0].state = "active";
  return steps;
}

const STAGE_TITLE: Record<string, (vault: string) => string> = {
  intake: () => "Receiving your file",
  preprocess: () => "Cleaning up the image",
  extract: () => "Reading the details",
  classify: (v) => `Matching it to ${v}`,
  tamper: () => "Checking it's genuine",
  decision: () => "Deciding",
};

/** Plain wording for one check. Returns null for checks that only carry internal detail. */
export function plainCheck(
  check: Stage["checks"][number],
  ctx: { vaultName: string; maxDocAgeDays: number; outcome: Outcome | null; receipt?: boolean },
): string | null {
  const label = check.label.toLowerCase();
  const ok = check.status === "pass";
  const bad = check.status === "fail" || check.status === "warn";
  if (label === "confidence") return null;
  if (label === "route" || label.startsWith("decision")) {
    if (ctx.outcome === "approved") return "Approved and paid out.";
    if (ctx.outcome === "review") return "Passed to a person on our team.";
    if (ctx.outcome === "declined") return "Not approved.";
    return null;
  }
  if (label === "file type") return ok ? "The file type and size are fine." : "This file type can't be checked.";
  if (label === "exact duplicate") return ok ? "This exact file hasn't been sent before." : "This exact file was sent before.";
  if (label === "normalised") return "Straightened and cleaned up for reading.";
  if (label === "metadata") return bad ? "The file was saved by an editing app." : "No camera details in the file. That's normal for scans.";
  if (label === "document detected") return ok ? "Found a bill in the file." : "Couldn't find a bill in the file.";
  if (label === "fields extracted") return ok ? "Issuer, date and total read clearly." : "Some details were hard to read.";
  if (label === "matches purpose") {
    if (ctx.receipt) return ok ? "It fits the emergency you described." : "It doesn't clearly fit the emergency you described.";
    return ok ? `It matches what ${ctx.vaultName} is for.` : `It doesn't clearly match what ${ctx.vaultName} is for.`;
  }
  if (label === "amount covered") return ok ? "The total covers the amount asked for." : "The total is less than the amount asked for.";
  if (label === "document date") return ok ? `Dated within the last ${ctx.maxDocAgeDays} days.` : `Older than ${ctx.maxDocAgeDays} days.`;
  if (label === "name on document") return ok ? "The name matches you or a dependant." : "The name doesn't match you or a dependant.";
  if (label === "error level analysis") return ok ? "No signs of editing in the image." : "Parts of the image look edited.";
  if (label === "perceptual reuse") return ok ? "Not used for an earlier payout." : "Looks like a bill used before.";
  if (label === "visual edit signs") return ok ? "Nothing on the bill looks altered." : "Something on the bill looks altered.";
  // Unknown label: use the detail only if it's already plain words.
  if (check.detail && !/\d\s?%|confiden|threshold|model|sha-?\d|score|[≥≤]|\bela\b|anomaly|vision|ocr/i.test(check.detail)) return check.detail;
  if (check.status === "info") return null;
  return ok ? "Passed." : check.status === "warn" ? "Needs a closer look." : "Didn't pass.";
}

/** All six stages with plain names; `expanded` adds each stage's checks as detail lines. */
export function stageSteps(
  proof: ProofView,
  ctx: { vaultName: string; maxDocAgeDays: number; outcome: Outcome | null; expanded: boolean; now?: number },
): TimelineStep[] {
  const stages = proof.verification.stages;
  return stages.map((s, i) => {
    const receipt = proof.purpose === "emergency_receipt";
    const lines = ctx.expanded ? s.checks.map((c) => plainCheck(c, { ...ctx, receipt })).filter((x): x is string => !!x) : [];
    const showTime = (i === 0 || i === stages.length - 1) && s.finishedAt;
    return {
      key: s.key,
      title:
        s.key === "classify" && proof.purpose === "emergency_receipt" ? "Matching it to the emergency" : (STAGE_TITLE[s.key] ?? (() => s.name))(ctx.vaultName),
      state: STATE[s.status] ?? "pending",
      detail: lines.length ? lines.map((l) => `• ${l}`).join("\n") : undefined,
      time: showTime ? whenText(s.finishedAt!, ctx.now) : undefined,
    };
  });
}
