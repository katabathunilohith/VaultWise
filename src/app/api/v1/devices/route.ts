import { customer, handle, json } from "@/lib/api";
import { currentDevice, listDevices } from "@/lib/devices";

/**
 * The devices signed in to this account, most recently used first:
 * `{ devices: [{ id, platform, appVersion, firstSeen, lastSeen, trusted, trustableAt, current }] }`.
 * `current` marks the device making this request (none for a request without a device id, e.g. the web app with sign-in off).
 */
export const GET = handle(async () => {
  const user = await customer({ tick: false, access: "read" });
  return json({ devices: listDevices(user, await currentDevice(user)) });
});
