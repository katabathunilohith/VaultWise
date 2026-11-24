/**
 * Devices: which phones use an account. A new phone is untrusted for 24 hours (money out capped per
 * move) unless trusted with a texted code and the MPIN; any device can sign out the others; a
 * signed-out device is refused on every request, and so is any older sign-in except from a trusted
 * device. See README.md for the switch (DEVICES_ENFORCED), the rule for requests without a device id,
 * and every touch point outside this folder (marked `// devices`).
 */
export { devicesEnforced, UNTRUSTED_CAP_USD, COOL_DOWN_MS, NEW_ACCOUNT_WINDOW_MS, NEW_DEVICES_PER_HOUR, MAX_ACTIVE_DEVICES } from "./config";
export { DeviceError, DEVICE_REVOKED, SESSION_ENDED, type DeviceErrorCode } from "./errors";
export { readDeviceHeaders, coolDownEnds, isTrusted, trustableAtOf, signedInBefore, untrustedMoveCap, type DeviceHeaders } from "./rules";
export { type Device } from "./store";
export {
  type DeviceContext,
  touchDevice,
  deviceContext,
  currentDevice,
  assertDeviceMayMove,
  assertTrustedDevice,
  assertRegisteredDevice,
  trustDevice,
  revokeDevice,
  listDevices,
  deviceStatus,
} from "./service";
