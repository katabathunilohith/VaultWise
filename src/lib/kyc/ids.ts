/**
 * Government ID types, number formats and masking.
 * Full numbers only ever live in memory for the length of one request: the database keeps the
 * last 4 characters and an HMAC (see secret.ts). Never log a number.
 */

export const DOC_TYPES = ["aadhaar", "pan", "passport", "driving_licence", "voter_id", "national_id"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_LABELS: Record<DocType, string> = {
  aadhaar: "Aadhaar",
  pan: "PAN card",
  passport: "Passport",
  driving_licence: "Driving licence",
  voter_id: "Voter ID",
  national_id: "National ID",
};

const INDIA: DocType[] = ["aadhaar", "pan", "passport", "driving_licence", "voter_id"];
const ELSEWHERE: DocType[] = ["passport", "national_id"];

/** The ID types accepted for a market (rule-set code, e.g. "IN", "US"). */
export function docTypesFor(market: string): DocType[] {
  return market === "IN" ? INDIA : ELSEWHERE;
}

export function isDocType(v: unknown): v is DocType {
  return typeof v === "string" && (DOC_TYPES as readonly string[]).includes(v);
}

/** Upper-case, no spaces, dots or hyphens. */
export function normaliseId(raw: string): string {
  return raw.toUpperCase().replace(/[\s.\-/]/g, "");
}

/* ---------- Verhoeff checksum (Aadhaar's last digit) ---------- */

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** True when the digit string (check digit last) passes Verhoeff. */
export function verhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) c = D[c][P[i % 8][Number(rev[i])]];
  return c === 0;
}

/** The Verhoeff check digit to append to `digits`. */
export function verhoeffDigit(digits: string): string {
  let c = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) c = D[c][P[(i + 1) % 8][Number(rev[i])]];
  return String(INV[c]);
}

/* ---------- Formats ---------- */

const FORMATS: Record<Exclude<DocType, "aadhaar">, RegExp> = {
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  // Indian passport. Other countries' passports use the generic rule below.
  passport: /^[A-Z][0-9]{7}$/,
  // SS RR YYYY NNNNNNN: state, RTO, year, serial (separators removed by normaliseId).
  driving_licence: /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$/,
  voter_id: /^[A-Z]{3}[0-9]{7}$/,
  national_id: /^[A-Z0-9]{5,20}$/,
};
const GENERIC = /^[A-Z0-9]{5,20}$/;

export type IdCheck = { ok: true; number: string } | { ok: false; reason: string };

/**
 * Checks a number's format (and Aadhaar's checksum). `market` matters only for passports:
 * India uses the Indian format; elsewhere any 5–20 letters and digits.
 */
export function validateIdNumber(docType: DocType, raw: string, market?: string | null): IdCheck {
  const n = normaliseId(raw ?? "");
  const label = DOC_LABELS[docType];
  if (!n) return { ok: false, reason: `Enter your ${label} number.` };
  if (docType === "aadhaar") {
    if (!/^\d{12}$/.test(n)) return { ok: false, reason: "An Aadhaar number has 12 digits." };
    if (/^[01]/.test(n)) return { ok: false, reason: "That Aadhaar number doesn't look right. Check it and try again." };
    if (!verhoeffValid(n)) return { ok: false, reason: "That Aadhaar number doesn't look right. Check it and try again." };
    return { ok: true, number: n };
  }
  const format = docType === "passport" && market && market !== "IN" ? GENERIC : FORMATS[docType];
  // A passport with no market (account recovery) may be from anywhere.
  const ok = docType === "passport" && !market ? FORMATS.passport.test(n) || GENERIC.test(n) : format.test(n);
  return ok ? { ok: true, number: n } : { ok: false, reason: `That ${label} number doesn't look right. Check it and try again.` };
}

export function last4(n: string): string {
  return normaliseId(n).slice(-4);
}

/** How a number is shown anywhere: only its last 4 characters. */
export function maskId(docType: DocType | string | null, idLast4: string | null): string {
  if (!idLast4) return "";
  return docType === "aadhaar" ? `XXXX XXXX ${idLast4}` : `XXXX${idLast4}`;
}

/** "shaik@outlook.com" → "s***k@outlook.com". */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  if (!local) return `***@${domain}`;
  const masked = local.length <= 2 ? `${local[0]}***` : `${local[0]}***${local[local.length - 1]}`;
  return `${masked}@${domain}`;
}
