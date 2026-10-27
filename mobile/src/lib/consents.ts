import { getSession, setSession } from "./auth/session-state";
import { getItem, setItem } from "./storage";

/** One-time consents (AI assistant, AI checks, age), kept on the device and shown through useSession(). */
const KEY = "vw.consents";

interface Consents {
  ai?: boolean;
  /** May an AI read the bills and IDs I send? Missing until asked. */
  checks?: boolean;
  age?: boolean;
}

/** The saved consents (read once at start-up). */
export async function readConsents(): Promise<{ ai: boolean; checks: boolean | null; age: boolean }> {
  const raw = await getItem(KEY);
  let consents: Consents = {};
  try {
    consents = raw ? JSON.parse(raw) : {};
  } catch {
    consents = {};
  }
  return { ai: !!consents.ai, checks: typeof consents.checks === "boolean" ? consents.checks : null, age: !!consents.age };
}

async function saveConsents(next: Consents) {
  const { aiConsent, aiChecks, ageConfirmed } = getSession();
  const merged: Consents = { ai: aiConsent, checks: aiChecks ?? undefined, age: ageConfirmed, ...next };
  await setItem(KEY, JSON.stringify(merged));
  setSession({ aiConsent: !!merged.ai, aiChecks: typeof merged.checks === "boolean" ? merged.checks : null, ageConfirmed: !!merged.age });
}

export const giveAiConsent = () => saveConsents({ ai: true });
export const withdrawAiConsent = () => saveConsents({ ai: false });
export const confirmAge = () => saveConsents({ age: true });
/** The answer to "may an AI read the bills and IDs I send?" (features/ai-consent). */
export const answerAiChecks = (yes: boolean) => saveConsents({ checks: yes });
