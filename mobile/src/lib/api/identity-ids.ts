/**
 * identity: ID types, number formats and masking, the same rules the server applies
 * (src/lib/kyc/ids.ts), so a mistyped number is caught before anything is sent.
 * A full number only lives in a screen's memory until it's sent; everything shown is masked.
 */
import type { IdDocType } from "./identity-types";

export const DOC_LABELS: Record<IdDocType, string> = {
  aadhaar: "Aadhaar",
  pan: "PAN card",
  passport: "Passport",
  driving_licence: "Driving licence",
  voter_id: "Voter ID",
  national_id: "National ID card",
};

const INDIA: IdDocType[] = ["aadhaar", "pan", "passport", "driving_licence", "voter_id"];
const ELSEWHERE: IdDocType[] = ["passport", "national_id"];
const ALL: IdDocType[] = ["passport", "national_id", "aadhaar", "pan", "driving_licence", "voter_id"];

/** The ID types a market accepts (rule-set code, e.g. "IN", "UK"). Unknown market: every type. */
export function docTypesFor(market: string | null | undefined): IdDocType[] {
  if (!market) return ALL;
  return market === "IN" ? INDIA : ELSEWHERE;
}

export function docLabel(docType: string | null | undefined) {
  return (docType && DOC_LABELS[docType as IdDocType]) || "ID";
}

/** What the number looks like, for the field's hint. */
export function numberHint(docType: IdDocType, market: string | null | undefined): string {
  switch (docType) {
    case "aadhaar":
      return "12 digits.";
    case "pan":
      return "10 characters, like ABCDE1234F.";
    case "passport":
      return market === "IN" ? "A letter and 7 digits, like K1234567." : "The number at the top of the photo page.";
    case "driving_licence":
      return "State code, then 13 digits, like MH14 20110012345.";
    case "voter_id":
      return "3 letters and 7 digits.";
    case "national_id":
      return "5 to 20 letters or digits.";
  }
}

/** Upper case, without spaces, dots, slashes or hyphens. */
export function normaliseId(raw: string) {
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

function verhoeffValid(digits: string) {
  let c = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) c = D[c][P[i % 8][Number(rev[i])]];
  return c === 0;
}

/* ---------- formats ---------- */

const FORMATS: Record<Exclude<IdDocType, "aadhaar">, RegExp> = {
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  passport: /^[A-Z][0-9]{7}$/,
  driving_licence: /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$/,
  voter_id: /^[A-Z]{3}[0-9]{7}$/,
  national_id: /^[A-Z0-9]{5,20}$/,
};
const GENERIC = /^[A-Z0-9]{5,20}$/;

export type IdCheck = { ok: true; number: string } | { ok: false; reason: string };

/**
 * Checks a typed number's format (and Aadhaar's checksum). `market` matters only for passports:
 * India's format there, any 5 to 20 letters and digits elsewhere, either when unknown (recovery).
 */
export function validateIdNumber(docType: IdDocType, raw: string, market?: string | null): IdCheck {
  const n = normaliseId(raw ?? "");
  const label = DOC_LABELS[docType];
  if (!n) return { ok: false, reason: `Type your ${label} number.` };
  if (docType === "aadhaar") {
    if (!/^\d{12}$/.test(n)) return { ok: false, reason: "An Aadhaar number has 12 digits." };
    if (/^[01]/.test(n) || !verhoeffValid(n)) return { ok: false, reason: "That Aadhaar number doesn't look right. Check it and try again." };
    return { ok: true, number: n };
  }
  const ok =
    docType === "passport" && !market ? FORMATS.passport.test(n) || GENERIC.test(n) : (docType === "passport" && market !== "IN" ? GENERIC : FORMATS[docType]).test(n);
  return ok ? { ok: true, number: n } : { ok: false, reason: `That ${label} number doesn't look right. Check it and try again.` };
}

/** The last 4 characters, the most of a number that is ever kept or shown. */
export function last4(raw: string) {
  return normaliseId(raw).slice(-4);
}

/** How a number is shown anywhere: dots, then the last 4. */
export function maskId(docType: string | null | undefined, idLast4: string | null | undefined) {
  if (!idLast4) return "";
  return docType === "aadhaar" ? `•••• •••• ${idLast4}` : `••••${idLast4}`;
}

/** Screen readers say "ending in 4821" rather than reading out the dots. */
export function spokenId(docType: string | null | undefined, idLast4: string | null | undefined) {
  return idLast4 ? `${docLabel(docType)} ending in ${idLast4.split("").join(" ")}` : docLabel(docType);
}
