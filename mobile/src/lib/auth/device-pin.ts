import * as Crypto from "expo-crypto";
import { getItem, KEYS, setItem } from "../storage";
import { setSession } from "./session-state";

/**
 * The in-app PIN. It never leaves the device; only a salted SHA-256 is stored in the
 * Keychain/Keystore. The server keeps its own PIN for Tier 2 emergency releases.
 */
async function hash(pin: string, salt: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

/** Whether a device PIN has been set (read once at start-up). */
export async function readHasDevicePin() {
  return !!(await getItem(KEYS.devicePin));
}

export async function setDevicePin(pin: string) {
  const salt = Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, "0")).join("");
  await setItem(KEYS.devicePin, `${salt}:${await hash(pin, salt)}`);
  setSession({ hasDevicePin: true });
}

export async function checkDevicePin(pin: string) {
  const stored = await getItem(KEYS.devicePin);
  if (!stored) return false;
  const [salt, h] = stored.split(":");
  return (await hash(pin, salt)) === h;
}
