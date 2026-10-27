import { router, type Href } from "expo-router";
import { getConnection } from "@/lib/api/connection";
import { queryClient } from "@/lib/api/hooks";
import { invalidate, qk, withMode } from "@/lib/api/keys";
import { getSession } from "@/lib/auth/session-state";
import { answerAiChecks } from "@/lib/consents";

/**
 * "May an AI read the bills and IDs I send?" (App Store rule 5.1.2(i): name the AI company and ask
 * before personal data goes to it). Asked once, in a sheet, just before the first bill, receipt or ID
 * is sent. The answer is kept on the phone and goes with every request (lib/api/http.ts), and the
 * server keeps a "no" away from the AI. Changeable in the Trust centre.
 */

type Answer = "yes" | "no" | "cancel";

let waiting: ((answer: Answer) => void) | null = null;
/** The question on screen now, so a second tap waits for the same answer instead of opening another sheet. */
let asking: Promise<Answer> | null = null;

/** The sheet's route (app/ai-consent.tsx). Cast like the other module routes, so the module stands alone. */
const SHEET = "/ai-consent" as Href;

/** True when what is about to be sent could reach the AI and the person hasn't answered yet. */
export function needsAiAnswer() {
  // Practice: nothing leaves the phone.
  if (getConnection().mode === "demo") return false;
  if (getSession().aiChecks !== null) return false;
  // A server without an AI key has nothing to ask about.
  const me = queryClient.getQueryData<{ aiEnabled?: boolean }>(withMode("live", qk.me()));
  return me?.aiEnabled !== false;
}

/**
 * Call before sending a bill or an ID. Asks first if needed; resolves true to go ahead (the answer
 * goes with the request) or false when the person closed the sheet without answering.
 */
export async function ensureAiAnswer(): Promise<boolean> {
  if (!needsAiAnswer()) return true;
  asking ??= new Promise<Answer>((resolve) => {
    waiting = resolve;
    router.push(SHEET);
  });
  return (await asking) !== "cancel";
}

/** The sheet calls this as it closes. Saves a yes or no, then lets the waiting send carry on. */
export async function settleAiAsk(answer: Answer) {
  if (answer !== "cancel") await setAiChecks(answer === "yes");
  const done = waiting;
  waiting = null;
  asking = null;
  done?.(answer);
}

/** Saves the answer (the sheet, or the Trust centre switch). A yes can turn the weekly tip into an AI one. */
export async function setAiChecks(yes: boolean) {
  await answerAiChecks(yes);
  void invalidate(queryClient, "insight");
}
