import { requestHeaders } from "./auth/context";

/**
 * The person's answer to "may an AI read this?" (App Store rule 5.1.2(i): ask before personal data
 * goes to a third-party AI). Both apps ask before anything is sent and put the answer on every request
 * as `x-ai-consent: yes | no`: the phone app (mobile/src/lib/api/http.ts) and the web app
 * (src/lib/client.ts, from src/components/ai-consent.tsx).
 *
 * Only an explicit "yes" counts (plan 05). A "no", a missing header, or no request at all (scripts,
 * background work) keeps that request's data away from the AI provider: a person reads bills and IDs,
 * limit requests and the weekly tip use rules, and the assistant refuses with 403 `ai_consent_required`.
 */
export const AI_CONSENT_HEADER = "x-ai-consent";

export async function aiConsented(): Promise<boolean> {
  return (await requestHeaders()).get(AI_CONSENT_HEADER)?.trim().toLowerCase() === "yes";
}
