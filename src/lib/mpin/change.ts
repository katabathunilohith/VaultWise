import { z } from "zod";
import { run } from "../db";
import { audit } from "../audit";
import { hashPin, HttpError, type User } from "../users";
import { latestVerifiedRecord } from "../kyc/store";
import { MAX_PIN_INPUT, mpinEnforced } from "./config";
import { checkNewMpin } from "./policy";
import { recordSuccess } from "./attempts";
import { rememberPinLength } from "./meta";
import { MpinError, requireMpin } from "./verify";
import { alertMpinChanged } from "../alerts"; // alerts

/** The `pin` field money routes accept in their body. Its value is checked by `requireMpin()`. */
export const mpinField = z.string().max(MAX_PIN_INPUT).optional();

/**
 * Refuses a PIN someone is choosing (sign-up or a change). With MPIN_ENFORCED on: the policy in
 * policy.ts, using the date of birth from a verified ID when there is one (400 `mpin_weak` with a
 * `reason`). Off: the old rule, 4 to 6 digits, so older phone builds can still sign up.
 */
export function assertNewMpin(pin: string, user?: Pick<User, "id"> | null) {
  if (!mpinEnforced()) {
    if (!/^\d{4,6}$/.test(pin)) throw new HttpError(400, "PIN must be 4–6 digits");
    return;
  }
  const dob = user ? (latestVerifiedRecord(user.id)?.dob ?? null) : null;
  const r = checkNewMpin(pin, { dob });
  if (!r.ok) throw new MpinError(400, r.message, "mpin_weak", { reason: r.reason });
}

/** Records the length of a PIN a new account was opened with (createUser stores its hash). */
export function recordChosenMpin(userId: string, pin: string) {
  rememberPinLength(userId, pin.length);
}

/** Stores a new MPIN (already checked by the caller), clears wrong tries, and audits it (never the PIN). */
export function setMpin(user: Pick<User, "id">, pin: string, by: "change" | "reset" = "change") {
  const now = Date.now();
  run("UPDATE users SET pin_hash = ? WHERE id = ?", hashPin(pin), user.id);
  rememberPinLength(user.id, pin.length, now);
  recordSuccess(user.id, now);
  audit({ userId: user.id, actor: user.id, actorType: "user", action: "mpin.changed", entityType: "user", entityId: user.id, details: { by, digits: pin.length }, ts: now });
  alertMpinChanged(user.id, by); // alerts
}

/**
 * Changes the MPIN: the new one must pass the policy, and the current one is needed whatever the
 * switch says (a stolen session alone can't change it). Wrong current PINs count toward the lock.
 */
export function changeMpin(user: User, currentPin: string | null | undefined, newPin: string) {
  assertNewMpin(newPin, user);
  if (user.pin_hash) requireMpin(user, currentPin, "mpin_change", { always: true });
  setMpin(user, newPin, "change");
}
