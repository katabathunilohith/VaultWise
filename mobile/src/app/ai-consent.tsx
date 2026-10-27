import { AiConsentSheet } from "@/features/ai-consent";

/** "Can an AI read what you send?": opened by ensureAiAnswer() before the first bill or ID is sent. */
export default function AiConsentRoute() {
  return <AiConsentSheet />;
}
