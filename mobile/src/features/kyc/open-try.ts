import { getItem, removeItem, setItem } from "@/lib/storage";

/**
 * kyc-checks: the DigiLocker visit or ₹1 payment the person has started, kept on the device until it
 * finishes. Paying in a UPI app (or a long DigiLocker sign-in) leaves Vaultwise, and the app lock or
 * the phone can close the screen meanwhile; coming back to Verify your ID picks the same try up
 * again, so nobody pays ₹1 twice. Only the try's id and the link to reopen are kept, never a number.
 * The key starts with "vw.", so Delete account wipes it (lib/storage.ts).
 */
const KEY = "vw.kyc.openTry";
/** DigiLocker's start doesn't say when it expires; an older try is dropped and started again. */
const MAX_AGE_MS = 30 * 60_000;

export interface OpenTry {
  step: "aadhaar" | "bank";
  requestId: string;
  /** DigiLocker: the provider's page. Bank: the upi://pay link. */
  link: string;
  expiresAt: number | null;
  /** A Practice try is never picked up live, and the other way round. */
  practice: boolean;
  savedAt: number;
}

const LINK_OK: Record<OpenTry["step"], RegExp> = { aadhaar: /^https?:\/\/\S+$/i, bank: /^upi:\/\/pay\?\S+$/i };

export function saveOpenTry(t: Omit<OpenTry, "savedAt">) {
  void setItem(KEY, JSON.stringify({ ...t, savedAt: Date.now() }));
}

export function clearOpenTry() {
  void removeItem(KEY);
}

/** The saved try for this step, if it's still usable here. */
export async function readOpenTry(step: OpenTry["step"], practice: boolean, now = Date.now()): Promise<OpenTry | null> {
  try {
    const raw = await getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as Partial<OpenTry>;
    if (t.step !== step || t.practice !== practice || typeof t.requestId !== "string" || !t.requestId) return null;
    if (typeof t.link !== "string" || !LINK_OK[step].test(t.link) || typeof t.savedAt !== "number") return null;
    const expiresAt = typeof t.expiresAt === "number" ? t.expiresAt : null;
    if ((expiresAt ?? t.savedAt + MAX_AGE_MS) <= now) {
      clearOpenTry();
      return null;
    }
    return { step, requestId: t.requestId, link: t.link, expiresAt, practice, savedAt: t.savedAt };
  } catch {
    return null;
  }
}
