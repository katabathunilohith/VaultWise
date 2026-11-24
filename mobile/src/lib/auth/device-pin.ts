import * as Crypto from "expo-crypto";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js"; // protection
import { sha256 } from "@noble/hashes/sha2.js"; // protection
import { bytesToHex } from "@noble/hashes/utils.js"; // protection
import { getItem, KEYS, onDeviceReset, setItem } from "../storage";
import { applyLockDefault } from "./app-lock"; // protection
import { setSession } from "./session-state";

/**
 * The PIN that unlocks the app on this phone, stored only as a slow salted hash in the
 * Keychain/Keystore. It is the same PIN as the MPIN the server checks for money moves
 * (features/mpin): onboarding and Change MPIN set both, and an MPIN the server accepts updates it,
 * so unlocking still works offline against this copy.
 *
 * protection (plan 04, baseline N4): stored as `pbkdf2:<iterations>:<salt>:<hash>:<digits>`,
 * PBKDF2-HMAC-SHA256 (pure JS, @noble/hashes) with a 16-byte random salt. Older values are
 * `<salt>:<hash>:<digits>` (one SHA-256 over `<salt>:<pin>`), or `<salt>:<hash>` for a 4-digit PIN
 * from before the MPIN; they keep working and are rewritten as PBKDF2 on the next right PIN.
 *
 * The iteration count is measured on each phone when a PIN is saved, so one check takes about
 * TARGET_MS there, between MIN_ITERATIONS and MAX_ITERATIONS, and is stored with the hash (so it
 * can be retuned without breaking saved PINs). Hermes runs it as plain JavaScript with no JIT,
 * which is far slower than a browser: expect a few thousand iterations on a phone and the maximum
 * on the web preview.
 */
const TARGET_MS = 300;
const MIN_ITERATIONS = 1_000;
const MAX_ITERATIONS = 100_000;
/** Short runs to time this phone with: doubled until one takes PROBE_MIN_MS (or PROBE_MAX_ITERATIONS). */
const PROBE_ITERATIONS = 250;
const PROBE_MIN_MS = 50;
const PROBE_MAX_ITERATIONS = 16_000;
const PREFIX = "pbkdf2";

type Stored =
  | { kind: "pbkdf2"; iterations: number; salt: string; h: string; length: number }
  | { kind: "sha256"; salt: string; h: string; length: number };

async function legacyHash(pin: string, salt: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

/** Lets the pad show "checking" before the JS thread is busy hashing. */
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

async function slowHash(pin: string, salt: string, iterations: number) {
  return bytesToHex(await pbkdf2Async(sha256, pin, salt, { c: iterations, dkLen: 32 }));
}

let calibrated: number | null = null;

/**
 * Iterations that take about TARGET_MS on this phone (measured once per launch). A run too short to
 * time well (a JIT warming up on the web, a fast phone) is doubled until it's long enough.
 */
async function iterationsForThisPhone() {
  if (calibrated !== null) return calibrated;
  let probe = PROBE_ITERATIONS;
  let ms = 0;
  for (;;) {
    const started = Date.now();
    await slowHash("000000", "calibration", probe);
    ms = Math.max(1, Date.now() - started);
    if (ms >= PROBE_MIN_MS || probe >= PROBE_MAX_ITERATIONS) break;
    probe *= 2;
  }
  const n = Math.round(((TARGET_MS / ms) * probe) / 100) * 100;
  calibrated = Math.min(MAX_ITERATIONS, Math.max(MIN_ITERATIONS, n));
  return calibrated;
}

/** Same length and every character compared, so the time doesn't say how much matched. */
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The stored PIN's length, once read (null: no PIN on this phone). */
let knownLength: number | null | undefined;

function parse(stored: string | null): Stored | null {
  if (!stored) return null;
  const parts = stored.split(":");
  if (parts[0] === PREFIX) {
    const [, iterations, salt, h, digits] = parts;
    return { kind: "pbkdf2", iterations: Number(iterations) || MIN_ITERATIONS, salt, h, length: Number(digits) || 4 };
  }
  const [salt, h, digits] = parts;
  return { kind: "sha256", salt, h, length: Number(digits) || 4 };
}

/** Whether a device PIN has been set (read once at start-up). */
export async function readHasDevicePin() {
  return !!(await getItem(KEYS.devicePin));
}

/** How many digits the device PIN has: 6 for an MPIN, 4 for a PIN from before; null when there's none. */
export async function readDevicePinLength(): Promise<number | null> {
  if (knownLength !== undefined) return knownLength;
  knownLength = parse(await getItem(KEYS.devicePin))?.length ?? null;
  return knownLength;
}

/** Hashes and saves the PIN (PBKDF2, a new salt). */
async function store(pin: string) {
  await yieldToUi();
  const salt = Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, "0")).join("");
  const iterations = await iterationsForThisPhone();
  await setItem(KEYS.devicePin, `${PREFIX}:${iterations}:${salt}:${await slowHash(pin, salt, iterations)}:${pin.length}`);
  knownLength = pin.length;
}

export async function setDevicePin(pin: string) {
  await store(pin);
  setSession({ hasDevicePin: true });
  await applyLockDefault(); // protection: app lock on by default once there's a PIN
}

export async function checkDevicePin(pin: string) {
  const stored = parse(await getItem(KEYS.devicePin));
  if (!stored || pin.length !== stored.length) return false;
  if (stored.kind === "pbkdf2") {
    await yieldToUi();
    return sameText(await slowHash(pin, stored.salt, stored.iterations), stored.h);
  }
  // protection: an older single SHA-256. Right once, it's rewritten as PBKDF2.
  if (!sameText(await legacyHash(pin, stored.salt), stored.h)) return false;
  try {
    await store(pin);
  } catch {
    // Still the old hash; it's upgraded at the next right PIN.
  }
  return true;
}

// Delete account and sign-out remove the stored PIN.
onDeviceReset(() => {
  knownLength = null;
});
