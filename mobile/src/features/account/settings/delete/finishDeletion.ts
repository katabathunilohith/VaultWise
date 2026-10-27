import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { byName } from "@/lib/api/keys";
import { resetDevice } from "@/lib/session";
import { getAuthState } from "@/lib/auth/firebase"; // identity
import { getConnection } from "@/lib/api/connection"; // identity
import { signOutOfVaultwise } from "@/features/auth"; // identity

const isMe = byName("me");

/**
 * Deletes the account: the server wallet (live) or the demo data, then everything this phone
 * keeps for it (PIN, app lock, consents, notification choices, support cases, Home's choices;
 * each store also drops its copy in memory) and every cached response.
 *
 * /me is re-read rather than cleared, so the root gate never blanks: live, the server now has no
 * wallet and the gate moves to Welcome on its own; in demo mode the sample account is always there,
 * so the caller returns to Home. Cached data nobody is showing is dropped; anything still on screen
 * (the tabs under Settings, in demo mode) is re-read so it can't show the deleted balances.
 */
export async function finishDeletion(qc: QueryClient) {
  await api.reset();
  // identity: live with sign-in on, the server has closed the account, so this login signs out too
  // (which also clears the phone's data). Deleting the Practice account leaves the live login alone.
  if (getConnection().mode === "live" && getAuthState().user) await signOutOfVaultwise();
  else await resetDevice();
  await qc.invalidateQueries({ predicate: isMe });
  qc.removeQueries({ predicate: (q) => !isMe(q) && q.getObserversCount() === 0 });
  await qc.invalidateQueries({ predicate: (q) => !isMe(q) });
}
