/**
 * mpin: the switch. On, every money move asks for the MPIN (features/mpin/README.md). Off, flows
 * send no MPIN and nothing is asked: only for a server running with MPIN_ENFORCED=false.
 */
export const MPIN_ENABLED = true;

/** The sheet's route (app/mpin.tsx). */
export const MPIN_ROUTE = "/mpin";

/** If the sheet hasn't opened by then (its route isn't available), the ask counts as cancelled. */
export const SHEET_OPEN_TIMEOUT_MS = 3000;

// devices (plan 06)
/** Forgot your MPIN: a code to the verified phone, then a new MPIN (app/settings/reset-mpin.tsx). */
export const RESET_MPIN_ROUTE = "/settings/reset-mpin";
/** Trust this phone (features/devices, app/settings/trust-device.tsx): where a `device_untrusted` answer points. */
export const TRUST_PHONE_ROUTE = "/settings/trust-device";
