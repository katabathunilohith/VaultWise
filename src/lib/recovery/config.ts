import { HttpError } from "../users";

/** The module's switch: RECOVERY_ENABLED=false turns off find, reset and claims (404 recovery_off). On by default. */
export function recoveryEnabled() {
  return process.env.RECOVERY_ENABLED?.trim().toLowerCase() !== "false";
}

export function assertRecoveryEnabled() {
  if (!recoveryEnabled()) throw new HttpError(404, "Account recovery is switched off on this server.", "recovery_off");
}
