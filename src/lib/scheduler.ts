import { runDueContributions } from "./vaults";
import { settleEmergencies } from "./emergency";
import { runDueSips } from "./invest/core";
import type { User } from "./users";

/**
 * Lazy scheduler: due recurring contributions, held emergency releases and
 * SIP debits are processed whenever the customer's data is read, so the
 * prototype behaves like an always-on backend without a separate worker.
 */
export async function tick(user: User) {
  const now = Date.now();
  runDueContributions(user, now);
  settleEmergencies(user, now);
  try {
    await runDueSips(user, now);
  } catch {
    // Market data unavailable — the SIP stays due and runs on the next tick.
  }
}
