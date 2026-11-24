import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { byName } from "@/lib/api/keys";
import { resetDevice } from "@/lib/session";
import { getAuthState } from "@/lib/auth/firebase"; // identity
import { getConnection } from "@/lib/api/connection"; // identity
import { signOutOfVaultwise } from "@/features/auth"; // identity

const isMe = byName("me");

/**
 * Deletes the account: the server wallet (live) or the demo data (`resetDone` when the caller has
 * already done that, with the MPIN), then everything this phone
 * keeps for it (PIN, app lock, consents, notification choices, support cases, Home's choices;
 * each store also drops its copy in memory) and every cached response.
 *
 * /me is re-read rather than cleared, so the root gate never blanks: live, the server now has no
 * wallet and the gate moves to Welcome on its own; in demo mode the sample account is always there,
 * so the caller returns to Home. Cached data nobody is showing is dropped; anything still on screen
 * (the tabs under Settings, in demo mode) is re-read so it can't show the deleted balances.
 */
export async function finishDeletion(qc: QueryClient, { resetDone = false }: { resetDone?: boolean } = {}) {
  // mpin: closing a signed-in account resets on the server first, with the MPIN (DeleteAccountScreen).
  if (!resetDone) await api.reset();
  // identity: live with sign-in on, the server has closed the account, so this login signs out too
  // (which also clears the phone's data). devices: the closed account's device id goes too.
  // protection: deleting Practice clears the phone's PIN and app lock, so a live login kept on this phone
  // (say, Practice because the server was unreachable) signs out as well rather than stay open with no
  // lock. Its device id stays: the live account still exists and this is still the same phone.
  const live = getConnection().mode === "live";
  if (getAuthState().user) await signOutOfVaultwise(null, { forgetDevice: live });
  else await resetDevice();
  await qc.invalidateQueries({ predicate: isMe });
  qc.removeQueries({ predicate: (q) => !isMe(q) && q.getObserversCount() === 0 });
  await qc.invalidateQueries({ predicate: (q) => !isMe(q) });
}
