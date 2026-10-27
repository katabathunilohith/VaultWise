import fs from "node:fs";
import { all, get, run, tx } from "../db";
import { audit } from "../audit";
import type { User } from "../users";
import { bindIdentity, disableOtherIdentities, ensureIdentityTables, markClosed } from "./identities";
import type { VerifiedToken } from "./verify";

/** Onboarding in firebase mode: the new wallet belongs to the signed-in identity. */
export function bindNewWallet(token: VerifiedToken, user: User) {
  tx(() => {
    bindIdentity({ uid: token.uid, userId: user.id, email: token.email, provider: token.provider, status: "active" });
    audit({
      userId: user.id,
      actor: token.uid,
      actorType: "user",
      action: "identity.bound",
      entityType: "identity",
      entityId: token.uid,
      details: { provider: token.provider, emailVerified: token.emailVerified },
    });
  });
}

/**
 * Firebase mode's "reset": closes the account. Every sign-in for it is disabled and the user is marked
 * closed; the data stays for audit. Pending recovery claims for it end.
 */
export function closeAccount(user: User, byUid: string) {
  ensureIdentityTables();
  const now = Date.now();
  tx(() => {
    // recovery: claims waiting on this account can't succeed any more.
    const hasClaims = get<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'recovery_claims'")!.n;
    if (hasClaims) {
      // Their ID photos go too (rejected claims keep no photo).
      for (const c of all<{ file_path: string | null }>("SELECT file_path FROM recovery_claims WHERE user_id = ? AND status = 'pending' AND file_path IS NOT NULL", user.id))
        fs.rmSync(c.file_path!, { force: true });
      run("UPDATE recovery_claims SET file_path = NULL WHERE user_id = ? AND status = 'pending'", user.id);
      run(
        "UPDATE recovery_claims SET status = 'rejected', decided_at = ?, decided_by = 'system:closed', reasons = ? WHERE user_id = ? AND status = 'pending'",
        now,
        JSON.stringify(["The account was closed."]),
        user.id,
      );
      run("UPDATE identities SET user_id = NULL, status = 'active', updated_at = ? WHERE user_id = ? AND status = 'recovery_pending'", now, user.id);
    }
    disableOtherIdentities(user.id, null, now);
    markClosed(user.id, now);
    audit({ userId: user.id, actor: byUid, actorType: "user", action: "user.closed", entityType: "user", entityId: user.id, ts: now });
  });
}
