import type { SupportTopic } from "./support/topics";

/**
 * Context the assistant hands to the support screen, so the person doesn't have to repeat
 * themselves. Kept in memory (not in the URL), and read once by the next support screen.
 */
export interface Handoff {
  topic?: SupportTopic;
  /** The person's last question in the chat. */
  question?: string;
}

let pending: Handoff | null = null;

export function setHandoff(h: Handoff) {
  pending = h;
}

/** Reads without clearing, so it's safe inside a state initialiser. */
export function peekHandoff(): Handoff | null {
  return pending;
}

export function clearHandoff() {
  pending = null;
}
