import { requestHeaders } from "./auth/context";

/**
 * The person's answer to "may an AI read this?" (App Store rule 5.1.2(i): ask before personal data
 * goes to a third-party AI). The phone app asks before anything is sent and puts the answer on every
 * request as `x-ai-consent: yes | no`. With "no", that request's data stays away from the AI provider:
 * a person reads bills and IDs, and limit requests and the weekly tip use rules. A client that sends
 * no header (the web app) keeps the behaviour it had before this header existed.
 */
export const AI_CONSENT_HEADER = "x-ai-consent";

export async function aiConsented(): Promise<boolean> {
  return (await requestHeaders()).get(AI_CONSENT_HEADER)?.trim().toLowerCase() !== "no";
}
