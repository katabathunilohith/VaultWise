/**
 * devices (plan 06): the switch for Your devices (the list, signing a device out, trusting this
 * phone) and for signing out when the server says this phone was signed out elsewhere. Off,
 * Settings has no Your devices row; the server's rules still apply, and the MPIN sheet still says
 * when a phone isn't trusted yet.
 */
export const DEVICES_ENABLED = true;

/** Your devices (app/settings/devices.tsx). */
export const DEVICES_ROUTE = "/settings/devices";
