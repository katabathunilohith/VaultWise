import { all, run, tx } from "../db";
import { audit } from "../audit";
import type { User } from "../users";
import { fallBack } from "./increase";
import { saveLimits, type ChangeRow } from "./store";

/**
 * Scheduler tick: emergency increases expire; limits fall back without ever loosening, and without undoing
 * another increase that is still active (see `fallBack()` in increase.ts).
 */
export function revertExpiredLimitIncreases(user: User, now = Date.now()) {
  const due = all<ChangeRow>(
    "SELECT * FROM limit_changes WHERE user_id = ? AND kind = 'emergency' AND status = 'applied' AND expires_at <= ?",
    user.id,
    now,
  );
  for (const r of due) {
    tx(() => {
      const restored = fallBack(user, r, now);
      saveLimits(user, restored, now);
      run("UPDATE limit_changes SET status = 'reverted' WHERE id = ?", r.id);
      audit({
        userId: user.id,
        actor: "scheduler",
        actorType: "system",
        action: "limits.emergency_expired",
        entityType: "limit_change",
        entityId: r.id,
        details: { restored },
        ts: now,
      });
    });
  }
  return due.length;
}
