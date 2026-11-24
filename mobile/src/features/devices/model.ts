import { relativeWhen, shortDate } from "@/features/home/format";
import type { Device, DevicePlatform } from "@/lib/api/security-types";

/**
 * Words for a device, pure. Platforms are all the server knows (no model names are sent), so a
 * device reads as "iPhone", "Android phone" or "Web browser".
 */
const NAMES: Record<DevicePlatform, string> = { ios: "iPhone", android: "Android phone", web: "Web browser", unknown: "Device" };

export function deviceName(d: Pick<Device, "platform">) {
  return NAMES[d.platform];
}

/** The same inside a sentence: "this iPhone", "that web browser". */
const NOUNS: Record<DevicePlatform, string> = { ios: "iPhone", android: "Android phone", web: "web browser", unknown: "device" };
export function deviceNoun(d: Pick<Device, "platform">) {
  return NOUNS[d.platform];
}

/** "iPhone · This phone"; a browser is "This device". */
export function deviceTitle(d: Pick<Device, "platform" | "current">) {
  return d.current ? `${NAMES[d.platform]} · ${d.platform === "web" ? "This device" : "This phone"}` : NAMES[d.platform];
}

/** "Vaultwise 1.2.0 · Active now" / "· Last seen 12 min ago". */
export function deviceSeenLine(d: Device, now = Date.now()) {
  const version = d.appVersion ? `Vaultwise ${d.appVersion}` : "Vaultwise";
  if (d.current) return `${version} · Active now`;
  if (d.lastSeen === null) return version;
  const ago = now - d.lastSeen;
  return `${version} · ${ago < 5 * 60_000 ? "Active now" : `Last seen ${relativeWhen(d.lastSeen, now).replace(/^Today, /, "today, ")}`}`;
}

/** "First signed in 3 Nov". */
export function deviceFirstLine(d: Device, now = Date.now()) {
  return d.firstSeen === null ? null : `First signed in ${shortDate(d.firstSeen, now)}`;
}

/** "Trusted", "Not trusted yet" (it trusts itself at `trustableAt`), or "Needs a code" (it never will by itself). */
export function trustLabel(d: Pick<Device, "trusted" | "trustableAt">) {
  return d.trusted ? "Trusted" : d.trustableAt === null ? "Needs a code" : "Not trusted yet";
}

/** Newest-first, with this phone on top. */
export function sortDevices(list: Device[]) {
  return [...list].sort((a, b) => Number(b.current) - Number(a.current) || (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
}
