import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { resetDevice } from "@/lib/session";
import { clearDraft } from "../../onboarding/draft";
import { resetPinAttempts } from "../../pin";
import { resetNotificationPrefs } from "../notificationPrefs";

const isMe = (q: { queryKey: readonly unknown[] }) => q.queryKey[1] === "me";

/**
 * Deletes the account: the server wallet (live) or the demo data, then everything this phone
 * keeps (PIN, app lock, consents, notification choices) and every cached response.
 *
 * /me is re-read rather than cleared, so the root gate never blanks: live, the server now has no
 * wallet and the gate moves to Welcome on its own; in demo mode the sample account is always there,
 * so the caller returns to Home. Cached data nobody is showing is dropped; anything still on screen
 * (the tabs under Settings, in demo mode) is re-read so it can't show the deleted balances.
 */
export async function finishDeletion(qc: QueryClient) {
  await api.reset();
  await Promise.all([resetPinAttempts(), resetNotificationPrefs(), resetDevice()]);
  clearDraft();
  await qc.invalidateQueries({ predicate: isMe });
  qc.removeQueries({ predicate: (q) => !isMe(q) && q.getObserversCount() === 0 });
  await qc.invalidateQueries({ predicate: (q) => !isMe(q) });
}
