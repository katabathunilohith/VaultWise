/**
 * mpin: the MPIN in Practice, mirroring the server (src/lib/mpin): every simulated money move out
 * needs it, wrong tries lock money moves on the same steps (5 wrong → 1 minute, then 5 minutes,
 * 30 minutes, 24 hours), errors carry the same codes, and changing it applies the same policy.
 *
 * The count and any lock are a Practice slice, so they survive a reload. "Start Practice over"
 * clears the count but keeps the MPIN (the phone keeps its PIN too); Delete account and sign-out
 * (a device reset) put the Practice MPIN back as well.
 */
import { checkNewMpin, lockMsAfter, triesLeftAfter, waitText } from "@/features/mpin/policy";
import { onDeviceReset } from "../../storage";
import { ApiError } from "../errors";
import { PRACTICE_PIN } from "../practice";
import type { MeMpin } from "../types";
import { registerPracticeSlice } from "./persist";

interface MpinState {
  /** The simulator's MPIN: the Practice MPIN until it's changed. */
  pin: string;
  /** Wrong tries since the last right one. */
  failures: number;
  /** Ms since epoch; may be in the past (an old lock). */
  lockedUntil: number | null;
}

const fresh = (): MpinState => ({ pin: PRACTICE_PIN, failures: 0, lockedUntil: null });
const M: MpinState = fresh();

registerPracticeSlice<MpinState>({
  key: "mpin",
  sensitive: true, // protection: a changed Practice MPIN is kept in secure storage, not the bulk save
  save: () => ({ ...M }),
  load: (saved) => {
    if (typeof saved?.pin !== "string" || !/^\d{4,6}$/.test(saved.pin)) throw new Error("Not a Practice MPIN");
    Object.assign(M, fresh(), {
      pin: saved.pin,
      failures: Number(saved.failures) || 0,
      lockedUntil: typeof saved.lockedUntil === "number" ? saved.lockedUntil : null,
    });
  },
  // Start over (and the first half of Delete account): the count goes, the MPIN stays.
  reset: () => Object.assign(M, { failures: 0, lockedUntil: null }),
});

// Delete account and sign-out wipe the phone's PIN, so the Practice MPIN goes back to the one shown on screen.
onDeviceReset(() => Object.assign(M, fresh()));

function lockedError(lockedUntil: number, now: number, justLocked: boolean) {
  const message = justLocked
    ? `That MPIN isn't right, and that was too many wrong tries. Money moves are locked for ${waitText(lockedUntil - now)}.`
    : `Too many wrong MPIN tries, so money moves are locked. Try again in ${waitText(lockedUntil - now)}.`;
  return new ApiError(message, 423, "mpin_locked", { lockedUntil });
}

/**
 * The server's requireMpin(): locked → 423 `mpin_locked` (not counted); no PIN → 401
 * `mpin_required`; wrong → 403 `mpin_wrong` with `triesLeft`, or 423 when this try starts a lock;
 * right → the count resets. Call it before anything moves.
 */
export function requirePracticeMpin(pin: string | null | undefined, now = Date.now()) {
  if (M.lockedUntil !== null && M.lockedUntil > now) throw lockedError(M.lockedUntil, now, false);
  if (!pin) throw new ApiError("Enter your MPIN to continue.", 401, "mpin_required");
  if (pin === M.pin) {
    M.failures = 0;
    M.lockedUntil = null;
    return;
  }
  M.failures += 1;
  const lock = lockMsAfter(M.failures);
  if (lock !== null) {
    M.lockedUntil = now + lock;
    throw lockedError(M.lockedUntil, now, true);
  }
  const left = triesLeftAfter(M.failures);
  throw new ApiError(`That MPIN isn't right. ${left === 1 ? "1 try" : `${left} tries`} left before money moves are locked.`, 403, "mpin_wrong", {
    triesLeft: left,
  });
}

/** POST /mpin: the new MPIN must pass the policy, then the current one is checked (wrong ones count). */
export function changePracticeMpin(currentPin: string, newPin: string) {
  const r = checkNewMpin(newPin);
  if (!r.ok) throw new ApiError(r.message, 400, "mpin_weak", { reason: r.reason });
  requirePracticeMpin(currentPin);
  M.pin = newPin;
  M.failures = 0;
  M.lockedUntil = null;
}

/** What the Practice /me says about the MPIN. */
export function practiceMpinStatus(now = Date.now()): MeMpin {
  return {
    upgradeDue: M.pin.length < 6,
    lockedUntil: M.lockedUntil !== null && M.lockedUntil > now ? M.lockedUntil : null,
    practiceDefault: M.pin === PRACTICE_PIN,
  };
}

// devices
/** POST /mpin/reset in Practice: the OTP token was already checked; the new MPIN must pass the policy. */
export function resetPracticeMpin(newPin: string) {
  const r = checkNewMpin(newPin);
  if (!r.ok) throw new ApiError(r.message, 400, "mpin_weak", { reason: r.reason });
  Object.assign(M, { pin: newPin, failures: 0, lockedUntil: null });
}
