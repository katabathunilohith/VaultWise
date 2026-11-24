/**
 * Phone numbers, pure: the dialling code for the person's country, cleaning up what they typed, and
 * the E.164 check the server applies (`+` then 8 to 15 digits).
 */

/** Dialling codes for the countries Vaultwise serves (me.json `countries`). */
const DIAL: Record<string, string> = {
  US: "+1",
  CA: "+1",
  GB: "+44",
  IN: "+91",
  SG: "+65",
  AU: "+61",
  AE: "+971",
  AT: "+43",
  BE: "+32",
  BG: "+359",
  HR: "+385",
  CY: "+357",
  EE: "+372",
  FI: "+358",
  FR: "+33",
  DE: "+49",
  GR: "+30",
  IE: "+353",
  IT: "+39",
  LV: "+371",
  LT: "+370",
  LU: "+352",
  MT: "+356",
  NL: "+31",
  PT: "+351",
  SK: "+421",
  SI: "+386",
  ES: "+34",
};

/** "+91" for India; "+" when the country isn't known. */
export function dialCodeFor(country: string | null | undefined) {
  return (country && DIAL[country.toUpperCase()]) || "+";
}

/** Spaces, dashes, dots and brackets go; a leading 00 becomes +. */
export function cleanPhone(typed: string) {
  const t = typed.replace(/[\s().-]/g, "");
  return t.startsWith("00") ? `+${t.slice(2)}` : t;
}

/** The server's rule: + and the country code, 8 to 15 digits in all. */
export function isPhoneNumber(e164: string) {
  return /^\+[1-9]\d{7,14}$/.test(e164);
}

/** Why a typed number won't do, or null when it will. */
export function phoneProblem(typed: string): string | null {
  const n = cleanPhone(typed);
  if (!n.startsWith("+")) return "Start with + and your country code, like +91.";
  if (/[^\d+]/.test(n.slice(1)) || n.indexOf("+", 1) !== -1) return "Use digits only after the +.";
  if (!isPhoneNumber(n)) return "That number looks too short or too long. Check it and try again.";
  return null;
}
