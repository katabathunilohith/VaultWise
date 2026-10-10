import type { Tone, TimelineStep } from "@/components/ui";
import { caseStatus, type SupportCase } from "./cases";
import { clockTime, ordinal } from "./time";

/** Received → With a person → Replied, with exact times. Practice mode says nobody replies. */
export function caseSteps(c: SupportCase, now: number): TimelineStep[] {
  const { stage, position } = caseStatus(c, now);
  const due = `by ${clockTime(c.replyBy, now)}`;
  return [
    { key: "received", title: "Received", state: "done", time: clockTime(c.createdAt, now), detail: attachedLine(c) },
    stage === "queued"
      ? { key: "person", title: "With a person", state: "active", detail: `You're ${ordinal(position)} in line.` }
      : { key: "person", title: "With a person", state: "done", detail: "Simulated in Practice mode." },
    {
      key: "replied",
      title: "Replied",
      state: stage === "withPerson" ? "active" : "pending",
      time: due,
      detail: stage === "overdue" ? "No reply arrives in Practice mode." : "The reply will show on this screen.",
    },
  ];
}

export function caseBadge(c: SupportCase, now: number): { tone: Tone; label: string } {
  const { stage, position } = caseStatus(c, now);
  if (stage === "queued") return { tone: "neutral", label: `${ordinal(position)} in line` };
  if (stage === "withPerson") return { tone: "info", label: "With a person" };
  return { tone: "neutral", label: "No reply in Practice" };
}

function attachedLine(c: SupportCase) {
  if (c.attached === "off") return "Your message.";
  if (c.attached === "unavailable") return "Your message. Your recent activity didn't load, so it wasn't added.";
  if (c.attached === 0) return "Your message. You have no recent activity to add.";
  return `Your message and your last ${c.attached === 1 ? "money move" : `${c.attached} money moves`}.`;
}
