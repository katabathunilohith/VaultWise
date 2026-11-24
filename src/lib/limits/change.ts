import { newId, run, tx } from "../db";
import { audit } from "../audit";
import { rulesFor } from "../compliance";
import { HttpError, type User } from "../users";
import { fmtDate } from "../shared";
import { alertLimitLoosened } from "../alerts"; // alerts
import { diff, validate, type Limits } from "./bounds";
import { nextMonthStart } from "./period";
import { getLimits, saveLimits } from "./store";
import { standardChangesThisMonth } from "./usage";

/** Standard change: tightening is always allowed; loosening uses the monthly allowance. */
export function changeLimits(user: User, next: Partial<Limits>, now = Date.now()) {
  validate(user, next);
  const rules = rulesFor(user.jurisdiction);
  return tx(() => {
    const before = getLimits(user);
    const after = { ...before, ...next };
    const d = diff(before, after);
    if (!d.loosened.length && !d.tightened.length) throw new HttpError(400, "Nothing changed");
    if (d.loosened.length && standardChangesThisMonth(user, now).length >= rules.limits.loosenPerMonth) {
      throw new HttpError(
        409,
        `You've already raised a limit this month — the next change is available on ${fmtDate(nextMonthStart(now))}. In a genuine emergency you can request an exception.`,
      );
    }
    const kind = d.loosened.length ? "standard" : "tighten";
    saveLimits(user, after, now);
    // A deliberate monthly change replaces any temporary emergency increase.
    if (kind === "standard")
      run("UPDATE limit_changes SET status = 'superseded' WHERE user_id = ? AND kind = 'emergency' AND status = 'applied'", user.id);
    const id = newId("lim");
    run(
      `INSERT INTO limit_changes (id, user_id, kind, status, before_limits, after_limits, created_at, decided_at)
       VALUES (?, ?, ?, 'applied', ?, ?, ?, ?)`,
      id,
      user.id,
      kind,
      JSON.stringify(before),
      JSON.stringify(after),
      now,
      now,
    );
    audit({
      userId: user.id,
      actor: user.id,
      actorType: "user",
      action: `limits.${kind}`,
      entityType: "limit_change",
      entityId: id,
      details: { before, after, loosened: d.loosened, tightened: d.tightened },
      ts: now,
    });
    if (kind === "standard") alertLimitLoosened(user.id, "You raised a withdrawal limit."); // alerts
    return { id, kind, limits: after };
  });
}
