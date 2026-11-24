import { all, get, parseJson, run, tx } from "../db";
import { audit } from "../audit";
import { rulesFor } from "../compliance";
import { HttpError, type User } from "../users";
import { alertLimitLoosened } from "../alerts"; // alerts
import { validate, type Limits } from "./bounds";
import { planIncrease } from "./increase";
import { getLimits, saveLimits, type ChangeRow } from "./store";
import { viewChange } from "./view";

/** The person's side of emergency requests the policy sent to review: the queue and the decision. */

export function pendingLimitReviews() {
  return all<ChangeRow & { user_name: string; currency: string; jurisdiction: string }>(
    `SELECT c.*, u.name AS user_name, u.currency, u.jurisdiction FROM limit_changes c JOIN users u ON u.id = c.user_id
     WHERE c.status = 'in_review' ORDER BY c.created_at`,
  ).map((r) => ({ ...viewChange(r), userName: r.user_name, currency: r.currency }));
}

export function reviewLimitChange(id: string, decision: "approved" | "denied", reviewer: string, note: string, now = Date.now()) {
  return tx(() => {
    const r = get<ChangeRow>("SELECT * FROM limit_changes WHERE id = ?", id);
    if (!r) throw new HttpError(404, "Request not found");
    if (r.status !== "in_review") throw new HttpError(409, "This request isn't awaiting review");
    const user = get<User>("SELECT * FROM users WHERE id = ?", r.user_id)!;
    const rules = rulesFor(user.jurisdiction);
    const expiresAt = decision === "approved" ? now + rules.limits.emergencyIncreaseDays * 86_400_000 : null;
    if (decision === "approved") {
      const after = parseJson<Limits>(r.after_limits, getLimits(user));
      validate(user, after);
      // Applied on top of the limits as they are now (see increase.ts); the row then records the applied increase.
      const plan = planIncrease(user, parseJson<Limits>(r.before_limits, getLimits(user)), after);
      saveLimits(user, plan.limits, now);
      run("UPDATE limit_changes SET before_limits = ?, after_limits = ? WHERE id = ?", JSON.stringify(plan.before), JSON.stringify(plan.after), id);
    }
    run(
      "UPDATE limit_changes SET status = ?, reviewer = ?, reviewer_note = ?, expires_at = ?, decided_at = ? WHERE id = ?",
      decision === "approved" ? "applied" : "denied",
      reviewer,
      note,
      expiresAt,
      now,
      id,
    );
    audit({
      userId: user.id,
      actor: reviewer,
      actorType: "reviewer",
      action: `limits.reviewed_${decision}`,
      entityType: "limit_change",
      entityId: id,
      details: { note, expiresAt },
      ts: now,
    });
    if (decision === "approved") alertLimitLoosened(user.id, "A reviewer approved your request to raise a limit."); // alerts
  });
}
