import { fmtMoney } from "../shared";
import { raiseAlert } from "./raise";

/**
 * The wording of every alert, in one place, so a call site elsewhere is a single line.
 * Plain English for customers; no amounts beyond the one being reported, never a PIN or code.
 */

type Money = { id: string; currency: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "45 seconds", "5 minutes", "24 hours", rounded up. */
export function durationText(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return plural(s, "second");
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return plural(m, "minute");
  return plural(Math.ceil(ms / 3_600_000), "hour");
}

/** "an iPhone", "an Android phone", "a web browser", "a device". */
export function deviceLabel(platform: string | null | undefined): string {
  if (platform === "ios") return "an iPhone";
  if (platform === "android") return "an Android phone";
  if (platform === "web") return "a web browser";
  return "a device";
}

/** Money left the account: `what` finishes the sentence, e.g. "paid to Asha from your wallet". */
export function alertMoneyOut(user: Money, amount: number, what: string) {
  return raiseAlert(user.id, "money_out", "Money sent", `${fmtMoney(amount, user.currency)} ${what}. If this wasn't you, contact support now.`);
}

/** An emergency withdrawal was released at once, or started with a hold before release. */
export function alertEmergency(user: Money, amount: number, status: string) {
  const money = fmtMoney(amount, user.currency);
  if (status === "released")
    return raiseAlert(user.id, "money_out", "Emergency money released", `${money} from your vaults is on its way to your bank. If this wasn't you, contact support now.`);
  return raiseAlert(
    user.id,
    "money_out",
    "Emergency withdrawal started",
    `${money} will move from your vaults to your bank ${status === "cooling_off" ? "after a cooling-off period" : "after a short hold"}. If this wasn't you, contact support now.`,
  );
}

/** A limit went up or was turned off: `what` is a short sentence, e.g. "You raised a withdrawal limit." */
export function alertLimitLoosened(userId: string, what: string) {
  return raiseAlert(userId, "limit_loosened", "Limit raised", `${what} If this wasn't you, contact support now.`);
}

/** `moneyLocked` is false with MPIN_ENFORCED=false, when only the changes that always need the MPIN are locked. */
export function alertMpinLocked(userId: string, lockMs: number, moneyLocked = true) {
  return raiseAlert(
    userId,
    "mpin_locked",
    "MPIN locked",
    `Too many wrong MPIN tries, so ${moneyLocked ? "money moves are" : "anything that needs your MPIN is"} locked for ${durationText(lockMs)}. If this wasn't you, change your MPIN when the lock ends.`,
  );
}

export function alertMpinChanged(userId: string, by: "change" | "reset") {
  return raiseAlert(
    userId,
    "mpin_changed",
    by === "reset" ? "MPIN reset" : "MPIN changed",
    `${by === "reset" ? "Your MPIN was reset with a texted code." : "Your MPIN was changed."} If this wasn't you, contact support now.`,
  );
}

/** A phone number was added or replaced. `holdMs`: how long it can't be used to reset the MPIN (src/lib/otp). */
export function alertPhoneVerified(userId: string, maskedNumber: string, holdMs?: number) {
  const hold = holdMs ? ` For your safety it can't be used to reset your MPIN for the next ${durationText(holdMs)}.` : "";
  return raiseAlert(
    userId,
    "phone_verified",
    "Phone number verified",
    `${maskedNumber} is now the verified phone number on your account.${hold} If this wasn't you, contact support now.`,
  );
}

export function alertNewDevice(userId: string, platform: string | null) {
  return raiseAlert(
    userId,
    "new_device",
    "New device signed in",
    `Your account was opened on ${deviceLabel(platform)} we haven't seen before. If this wasn't you, sign it out in Settings > Devices and change your password.`,
  );
}

export function alertDeviceTrusted(userId: string, platform: string | null) {
  return raiseAlert(
    userId,
    "device_trusted",
    "Device trusted",
    `${deviceLabel(platform).replace(/^a/, "A")} can now move money without the new-device limit. If this wasn't you, sign it out in Settings > Devices.`,
  );
}

/**
 * A device was signed out. It can sign in again with the password, so the text doesn't promise it is out for
 * good: it then starts as a new device that needs a texted code and the MPIN before it can send more than a little.
 */
export function alertDeviceRevoked(userId: string, platform: string | null) {
  return raiseAlert(
    userId,
    "device_revoked",
    "Device signed out",
    `${deviceLabel(platform).replace(/^a/, "A")} was signed out of your account. To use it again it must sign in again, and it can then send only small amounts until it's trusted with a texted code and your MPIN. If this wasn't you, change your password.`,
  );
}
