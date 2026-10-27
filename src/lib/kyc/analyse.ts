import { aiEnabled, describeAiError } from "../groq";
import { aiConsented } from "../ai-consent";
import { EDITING_SOFTWARE, errorLevelAnalysis, readExif } from "../verification/forensics";
import { visionExtractor, type IdExtraction, type IdExtractor } from "./extract";
import { DOC_LABELS, normaliseId, validateIdNumber, type DocType } from "./ids";
import { compareNames } from "./names";
import type { KycCheck } from "./types";

/**
 * The automated part of an ID check, shared by KYC and account recovery:
 * read the card (vision model), check the number's format and checksum, compare the typed number,
 * compare the name, and look for signs the image was edited. It never decides "rejected":
 * `clean` means every check passed with confidence; anything else goes to a person.
 */
export interface IdAnalysis {
  /** Normalised number to hash (typed if valid, else read from the card), or null. */
  number: string | null;
  nameOnDoc: string | null;
  dob: string | null;
  checks: KycCheck[];
  reasons: string[];
  clean: boolean;
  aiUsed: boolean;
  /** The facts behind `clean`, for callers with their own rules (recovery's provisional access). */
  signals: {
    isIdDocument: boolean;
    docTypeMatches: boolean;
    /** Valid number read from the card, or null. */
    readNumber: string | null;
    /** True/false when a number was typed and one was read; null otherwise. */
    typedMatchesCard: boolean | null;
    editSignals: boolean;
    legible: boolean;
    expired: boolean;
  };
}

let extractorOverride: IdExtractor | null = null;

/** Tests swap the vision model for a fixed answer. Pass null to restore it. */
export function setIdExtractor(fn: IdExtractor | null) {
  extractorOverride = fn;
}

export async function analyseId(input: {
  docType: DocType;
  file: { buffer: Buffer; mime: string };
  typedNumber?: string | null;
  /** Account name to compare with the card; null skips the name check. */
  accountName: string | null;
  /** Rule-set code for passport formats; null accepts any country. */
  market: string | null;
}): Promise<IdAnalysis> {
  const label = DOC_LABELS[input.docType];
  const checks: KycCheck[] = [];
  const reasons: string[] = [];
  let clean = true;
  let editSignals = false;
  const unclear = (reason: string) => {
    clean = false;
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  // 1. The typed number (if any): format and checksum.
  let typed: string | null = null;
  if (input.typedNumber && input.typedNumber.trim()) {
    const v = validateIdNumber(input.docType, input.typedNumber, input.market);
    if (v.ok) {
      typed = v.number;
      checks.push({ label: "Number format", status: "pass", detail: `Typed ${label} number has a valid format` });
    } else {
      checks.push({ label: "Number format", status: "fail", detail: "Typed number has an invalid format" });
      unclear(v.reason);
    }
  }

  // 2. Read the card.
  let x: IdExtraction | null = null;
  // The person can say no to the AI reading their ID (lib/ai-consent.ts); a person reads it then.
  const consented = await aiConsented();
  const extractor = consented ? (extractorOverride ?? (aiEnabled() ? visionExtractor : null)) : null;
  if (!consented) {
    checks.push({ label: "Reading the card", status: "warn", detail: "You asked for a person to read the card instead of the AI." });
    unclear("A person will check your ID. This usually takes a day.");
  } else if (!extractor) {
    checks.push({ label: "Reading the card", status: "warn", detail: "Vision model not configured. A person will read the card." });
    unclear("A person will check your ID. This usually takes a day.");
  } else {
    try {
      x = await extractor(input.file, input.docType);
    } catch (e) {
      checks.push({ label: "Reading the card", status: "warn", detail: `Vision model unavailable: ${describeAiError(e)}` });
      unclear("A person will check your ID. This usually takes a day.");
    }
  }

  let read: string | null = null;
  if (x) {
    checks.push({
      label: "Identity document",
      status: x.is_id_document ? "pass" : "fail",
      detail: x.is_id_document ? `Looks like an identity document (legibility ${(x.legibility * 100).toFixed(0)}%)` : "Doesn't look like a real identity document",
    });
    if (!x.is_id_document) unclear("This doesn't look like a photo of an ID card. A person will take a look.");
    if (x.doc_type && x.doc_type !== input.docType) {
      checks.push({ label: "Document type", status: "warn", detail: `Chosen ${input.docType}, card looks like ${x.doc_type}` });
      unclear(`This doesn't look like a ${label}. A person will take a look.`);
    } else if (x.doc_type) {
      checks.push({ label: "Document type", status: "pass", detail: `Matches ${input.docType}` });
    }
    if (x.legibility < 0.6) {
      checks.push({ label: "Legibility", status: "warn", detail: `Legibility ${(x.legibility * 100).toFixed(0)}%` });
      unclear("The photo is hard to read. A person will take a look.");
    }

    // The number on the card.
    if (x.id_number) {
      const v = validateIdNumber(input.docType, x.id_number, input.market);
      if (v.ok) {
        read = v.number;
        checks.push({ label: "Number on card", status: "pass", detail: "Format and checksum valid" });
      } else {
        checks.push({ label: "Number on card", status: "fail", detail: "The number read from the card has an invalid format" });
        unclear("We couldn't read a valid number from the card. A person will take a look.");
      }
    } else {
      checks.push({ label: "Number on card", status: "warn", detail: "No number could be read" });
      unclear("We couldn't read the number on the card. A person will take a look.");
    }
    if (typed && read && normaliseId(typed) !== normaliseId(read)) {
      checks.push({ label: "Typed number", status: "fail", detail: "The typed number doesn't match the card" });
      unclear("The number you typed doesn't match the card. A person will take a look.");
    } else if (typed && read) {
      checks.push({ label: "Typed number", status: "pass", detail: "Matches the card" });
    }

    // Expiry.
    if (x.expiry && x.expiry < new Date().toISOString().slice(0, 10)) {
      checks.push({ label: "Expiry", status: "warn", detail: `Expired on ${x.expiry}` });
      unclear("This ID looks expired. A person will take a look.");
    }

    // Name.
    if (input.accountName !== null) {
      const m = compareNames(x.name, input.accountName);
      const detail = `Card name ${x.name ? "read" : "not read"}; match ${m.result} (${(m.score * 100).toFixed(0)}%)`;
      checks.push({ label: "Name", status: m.result === "match" ? "pass" : m.result === "mismatch" ? "fail" : "warn", detail });
      if (m.result !== "match") unclear("The name on the card doesn't clearly match your account name. A person will take a look.");
    }
  }

  // 3. Signs of editing (the same forensics used for proofs).
  try {
    const exif = await readExif(input.file.buffer);
    if (exif.software && EDITING_SOFTWARE.test(exif.software)) {
      checks.push({ label: "Editing software", status: "warn", detail: `Saved by "${exif.software}"` });
      editSignals = true;
      unclear("The photo looks edited. A person will take a look.");
    }
    const ela = await errorLevelAnalysis(input.file.buffer);
    if (ela) {
      const status = ela.score >= 0.5 ? "fail" : ela.score >= 0.2 ? "warn" : "pass";
      checks.push({ label: "Edited regions", status, detail: `Anomaly ${(ela.score * 100).toFixed(0)}%, largest region ${ela.largestCluster} blocks` });
      if (ela.score >= 0.2) {
        editSignals = true;
        unclear("The photo looks edited. A person will take a look.");
      }
    }
  } catch {
    checks.push({ label: "Edited regions", status: "warn", detail: "Image forensics could not run" });
    editSignals = true; // unknown counts as not clean
    unclear("We couldn't check the photo. A person will take a look.");
  }

  const number = typed ?? read;
  if (!number) clean = false;
  const today = new Date().toISOString().slice(0, 10);
  return {
    number,
    nameOnDoc: x?.name ?? null,
    dob: x?.dob ?? null,
    checks,
    reasons,
    clean,
    aiUsed: !!x,
    signals: {
      isIdDocument: !!x?.is_id_document,
      docTypeMatches: !!x && x.doc_type === input.docType,
      readNumber: read,
      typedMatchesCard: typed && read ? normaliseId(typed) === normaliseId(read) : null,
      editSignals,
      legible: !!x && x.legibility >= 0.6,
      expired: !!x?.expiry && x.expiry < today,
    },
  };
}
