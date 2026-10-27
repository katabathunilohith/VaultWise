import { expireStaleWithdrawals, runDueContributions } from "./vaults";
import { settleEmergencies } from "./emergency";
import { revertExpiredLimitIncreases } from "./limits";
import { runDueSips } from "./invest/core";
import type { User } from "./users";
import { autoSaveSource, runDueWalletContributions } from "./wallet"; // wallet

/**
 * Lazy scheduler: due recurring contributions, held emergency releases and
 * SIP debits are processed whenever the customer's data is read, so the
 * prototype behaves like an always-on backend without a separate worker.
 */
export async function tick(user: User) {
  const now = Date.now();
  // wallet: auto-saves come from the wallet when the customer chose it, otherwise from the bank as before.
  if (autoSaveSource(user) === "wallet") runDueWalletContributions(user, now);
  else runDueContributions(user, now);
  expireStaleWithdrawals(user, now);
  revertExpiredLimitIncreases(user, now);
  settleEmergencies(user, now);
  try {
    await runDueSips(user, now);
  } catch {
    // Market data unavailable — the SIP stays due and runs on the next tick.
  }
}
