/**
 * identity: shapes the server sends, ID types, and tolerant readers for the identity routes.
 * The readers accept camelCase or snake_case so the screens keep working while the routes settle.
 */
import { CLAIM_TTL_MS } from "./config";

export type KycStatus = "not_started" | "pending" | "needs_review" | "verified" | "rejected";
export type ClaimStatus = "pending" | "approved" | "rejected" | "cancelled" | "expired";

/** Fields the identity module adds to GET /api/v1/me. All optional, so older servers still work. */
export interface IdentityMe {
  auth?: { mode: "prototype" | "firebase"; access: "full" | "recovery"; email: string | null };
  kyc?: { status: KycStatus; docType?: string; idLast4?: string };
  recovery?: { claimId: string; status: string; createdAt: number };
}

/* ---------- ID types ---------- */

export type DocType = "aadhaar" | "pan" | "passport" | "driving_licence" | "voter_id" | "national_id";

interface DocInfo {
  label: string;
  placeholder: (market?: string | null) => string;
  /**
   * Checks the number after spaces and dashes are removed and letters are made capitals. Mirrors
   * validateIdNumber in src/lib/kyc/ids.ts. `market` only matters for passports (India has its own format).
   */
  check: (v: string, market?: string | null) => string | null;
}

const VERHOEFF_D = [
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
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

function verhoeffOk(digits: string) {
  let c = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(rev[i])]];
  return c === 0;
}

export const DOC_TYPES: Record<DocType, DocInfo> = {
  passport: {
    label: "Passport",
    placeholder: (market) => (market === "IN" ? "1 letter, then 7 digits" : "As printed on the photo page"),
    check: (v, market) =>
      market === "IN"
        ? /^[A-Z][0-9]{7}$/.test(v)
          ? null
          : "An Indian passport number is 1 letter, then 7 digits."
        : /^[A-Z0-9]{5,20}$/.test(v)
          ? null
          : "A passport number has 5 to 20 letters and digits.",
  },
  national_id: {
    label: "National ID card",
    placeholder: () => "As printed on the card",
    check: (v) => (/^[A-Z0-9]{5,20}$/.test(v) ? null : "An ID card number has 5 to 20 letters and digits."),
  },
  aadhaar: {
    label: "Aadhaar",
    placeholder: () => "12 digits",
    check: (v) =>
      !/^[0-9]{12}$/.test(v)
        ? "An Aadhaar number has 12 digits."
        : /^[01]/.test(v) || !verhoeffOk(v)
          ? "That Aadhaar number doesn't add up. Check each digit."
          : null,
  },
  pan: {
    label: "PAN card",
    placeholder: () => "10 characters, like ABCDE1234F",
    check: (v) => (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v) ? null : "A PAN has 5 letters, 4 digits, then 1 letter."),
  },
  driving_licence: {
    label: "Driving licence",
    placeholder: () => "2 letters, then 13 digits",
    check: (v) => (/^[A-Z]{2}[0-9]{13}$/.test(v) ? null : "A driving licence number has 2 letters, then 13 digits."),
  },
  voter_id: {
    label: "Voter ID",
    placeholder: () => "3 letters, then 7 digits",
    check: (v) => (/^[A-Z]{3}[0-9]{7}$/.test(v) ? null : "A voter ID has 3 letters, then 7 digits."),
  },
};

const INDIA: DocType[] = ["aadhaar", "pan", "passport", "driving_licence", "voter_id"];
const ELSEWHERE: DocType[] = ["passport", "national_id"];

/** ID types for a market. With no market (signed out) every type is offered. */
export function docTypesFor(jurisdiction?: string | null): DocType[] {
  if (!jurisdiction) return ["passport", "national_id", "aadhaar", "pan", "driving_licence", "voter_id"];
  return jurisdiction === "IN" ? INDIA : ELSEWHERE;
}

export function docLabel(t: string | null | undefined) {
  if (!t) return "ID";
  return DOC_TYPES[t as DocType]?.label ?? t.replace(/_/g, " ");
}

export function normalizeIdNumber(raw: string) {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Returns an error sentence, or null when the number looks right for its type. `market` is the account's
 * rule set ("IN", "US", ...); leave it out when it isn't known (finding or recovering an account).
 */
export function checkIdNumber(type: DocType, raw: string, market?: string | null): string | null {
  const v = normalizeIdNumber(raw);
  if (!v) return null;
  return DOC_TYPES[type].check(v, market);
}

/* ---------- Passwords (same rule as the mobile app) ---------- */

export const PASSWORD_RULE = "At least 8 characters, with a letter and a number.";

export function passwordOk(p: string) {
  return p.length >= 8 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);
}

export function endingIn(last4: string | null | undefined) {
  return last4 ? `ending ${last4}` : "";
}

/* ---------- Tolerant readers ---------- */

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
}

function pick(o: Obj, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function parseMaybeJson(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

export function strings(v: unknown): string[] {
  const x = parseMaybeJson(v);
  if (Array.isArray(x)) return x.map((i) => (typeof i === "string" ? i : (str(obj(i)?.message) ?? str(obj(i)?.label) ?? JSON.stringify(i))));
  return typeof x === "string" && x ? [x] : [];
}

/** Joins every list found under `keys` (the admin routes send `{ queue, recent }`), without repeats. */
function list(raw: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  const o = obj(raw);
  if (!o) return [];
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const k of keys)
    if (Array.isArray(o[k]))
      for (const i of o[k] as unknown[]) {
        const id = str(obj(i)?.id);
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        out.push(i);
      }
  return out;
}

export interface CheckLine {
  label: string;
  status: "pass" | "warn" | "fail" | "info";
  detail?: string;
}

function toStatus(v: unknown): CheckLine["status"] {
  if (v === true) return "pass";
  if (v === false) return "fail";
  const s = typeof v === "string" ? v.toLowerCase() : "";
  if (["pass", "passed", "ok", "match", "valid", "clean", "verified"].includes(s)) return "pass";
  if (["fail", "failed", "mismatch", "invalid", "rejected"].includes(s)) return "fail";
  if (["warn", "warning", "check", "review", "needs_review", "unclear"].includes(s)) return "warn";
  return "info";
}

function humanize(k: string) {
  const s = k.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Reads the automated checks, whether they come as a list or as a map of named results. */
export function readChecks(raw: unknown): CheckLine[] {
  const x = parseMaybeJson(raw);
  if (Array.isArray(x))
    return x.map((i) => {
      if (typeof i === "string") return { label: i, status: "info" as const };
      const o = obj(i) ?? {};
      return {
        label: str(pick(o, "label", "name", "key", "check")) ?? "Check",
        status: toStatus(pick(o, "status", "result", "pass", "ok", "passed")),
        detail: str(pick(o, "detail", "message", "summary", "note")) ?? undefined,
      };
    });
  const o = obj(x);
  if (!o) return [];
  return Object.entries(o).map(([k, v]) => {
    const inner = obj(v);
    if (inner)
      return {
        label: humanize(k),
        status: toStatus(pick(inner, "status", "result", "pass", "ok", "passed")),
        detail: str(pick(inner, "detail", "message", "summary", "note", "value")) ?? undefined,
      };
    if (typeof v === "boolean") return { label: humanize(k), status: toStatus(v) };
    if (typeof v === "number") return { label: humanize(k), status: "info" as const, detail: v <= 1 && v >= 0 ? `${Math.round(v * 100)}%` : String(v) };
    return { label: humanize(k), status: toStatus(v), detail: str(v) ?? undefined };
  });
}

/* KYC (GET/POST /api/v1/kyc) */

export interface KycView {
  status: KycStatus;
  docType: string | null;
  idLast4: string | null;
  reasons: string[];
  updatedAt: number | null;
}

const KYC_STATUSES: KycStatus[] = ["not_started", "pending", "needs_review", "verified", "rejected"];

function kycStatus(v: unknown): KycStatus {
  return KYC_STATUSES.includes(v as KycStatus) ? (v as KycStatus) : "not_started";
}

export function readKyc(raw: unknown): KycView | null {
  const top = obj(raw);
  const o = obj(top?.kyc) ?? top;
  if (!o || o.status === undefined) return null;
  return {
    status: kycStatus(o.status),
    docType: str(pick(o, "docType", "doc_type")),
    idLast4: str(pick(o, "idLast4", "id_last4")),
    reasons: strings(o.reasons),
    updatedAt: num(pick(o, "updatedAt", "updated_at", "decidedAt", "createdAt")),
  };
}

/** The ID check status for the signed-in customer, from /me. Older servers only send user.kycStatus. */
export function kycStatusOf(me: (IdentityMe & { user?: { kycStatus?: string } }) | null | undefined): KycStatus {
  if (me?.kyc?.status) return kycStatus(me.kyc.status);
  const s = me?.user?.kycStatus;
  if (!s) return "not_started";
  return KYC_STATUSES.includes(s as KycStatus) ? (s as KycStatus) : s === "approved" ? "verified" : "pending";
}

/* Recovery */

export interface FindResult {
  found: boolean;
  maskedEmail: string | null;
  canReset: boolean;
  findToken: string | null;
}

export function readFind(raw: unknown): FindResult {
  const o = obj(raw) ?? {};
  return {
    found: o.found === true,
    maskedEmail: str(pick(o, "maskedEmail", "masked_email")),
    canReset: o.canReset === true || o.can_reset === true,
    findToken: str(pick(o, "findToken", "find_token")),
  };
}

export interface ClaimView {
  id: string;
  status: ClaimStatus;
  docType: string | null;
  idLast4: string | null;
  /** The account's email we told about the claim, masked. */
  notifiedEmail: string | null;
  /**
   * What the login can do while the claim waits: "read_only" = overview and vaults are open now;
   * "after_approval" = nothing until a person approves (the login isn't tied to the account yet).
   */
  access: "read_only" | "after_approval" | null;
  reasons: string[];
  note: string | null;
  createdAt: number | null;
  decidedAt: number | null;
  expiresAt: number | null;
}

const CLAIM_STATUSES: ClaimStatus[] = ["pending", "approved", "rejected", "cancelled", "expired"];

function readClaimObj(o: Obj): ClaimView {
  const createdAt = num(pick(o, "createdAt", "created_at"));
  return {
    id: str(pick(o, "id", "claimId", "claim_id")) ?? "",
    status: CLAIM_STATUSES.includes(o.status as ClaimStatus) ? (o.status as ClaimStatus) : "pending",
    docType: str(pick(o, "docType", "doc_type")),
    idLast4: str(pick(o, "idLast4", "id_last4")),
    notifiedEmail: str(pick(o, "notifiedEmail", "notified_email")),
    access: o.access === "read_only" || o.access === "after_approval" ? o.access : null,
    reasons: strings(o.reasons),
    note: str(pick(o, "note", "decisionNote", "decision_note")),
    createdAt,
    decidedAt: num(pick(o, "decidedAt", "decided_at")),
    expiresAt: num(pick(o, "expiresAt", "expires_at")) ?? (createdAt ? createdAt + CLAIM_TTL_MS : null),
  };
}

/** GET /api/v1/recovery/claim: accepts `{ claim }`, the claim itself, or `{ claim: null }`. */
export function readClaim(raw: unknown): ClaimView | null {
  const top = obj(raw);
  if (!top) return null;
  if ("claim" in top) {
    const c = obj(top.claim);
    return c ? readClaimObj(c) : null;
  }
  return top.status ? readClaimObj(top) : null;
}

/* Admin queues */

export interface AdminKycItem {
  id: string;
  userName: string | null;
  userEmail: string | null;
  market: string | null;
  docType: string | null;
  idLast4: string | null;
  maskedId: string | null;
  nameOnDoc: string | null;
  dob: string | null;
  status: KycStatus;
  provider: string | null;
  checks: CheckLine[];
  reasons: string[];
  /** Where the reviewer can see the photo, or null when there is none. */
  imageUrl: string | null;
  createdAt: number | null;
  decidedAt: number | null;
  decidedBy: string | null;
  note: string | null;
}

/** The photo route for an item: an explicit URL if the server sent one, else the admin file route when `hasFile`. */
function photoUrl(o: Obj, base: string, id: string) {
  const explicit = str(pick(o, "imageUrl", "image_url", "fileUrl", "file_url"));
  if (explicit) return explicit;
  return o.hasFile === true || o.has_file === true ? `${base}/${encodeURIComponent(id)}/file` : null;
}

export function readKycQueue(raw: unknown): AdminKycItem[] {
  return list(raw, "queue", "recent", "items", "records").flatMap((i) => {
    const o = obj(i);
    if (!o) return [];
    const user = obj(o.user);
    const id = str(o.id) ?? "";
    return [
      {
        id,
        userName: str(pick(o, "userName", "user_name", "accountName", "account_name")) ?? str(user?.name),
        userEmail: str(pick(o, "userEmail", "user_email", "email")) ?? str(user?.email),
        market: str(pick(o, "market", "jurisdiction")),
        docType: str(pick(o, "docType", "doc_type")),
        idLast4: str(pick(o, "idLast4", "id_last4")),
        maskedId: str(pick(o, "maskedId", "masked_id")),
        nameOnDoc: str(pick(o, "nameOnDoc", "name_on_doc")),
        dob: str(o.dob),
        status: kycStatus(o.status),
        provider: str(o.provider),
        checks: readChecks(o.checks),
        reasons: strings(o.reasons),
        imageUrl: photoUrl(o, "/api/v1/admin/kyc", id),
        createdAt: num(pick(o, "createdAt", "created_at")),
        decidedAt: num(pick(o, "decidedAt", "decided_at")),
        decidedBy: str(pick(o, "decidedBy", "decided_by")),
        note: str(pick(o, "note", "decisionNote", "decision_note")),
      },
    ];
  });
}

export interface AdminClaimItem {
  id: string;
  claimantEmail: string | null;
  userName: string | null;
  accountEmail: string | null;
  docType: string | null;
  idLast4: string | null;
  maskedId: string | null;
  /** Every login tied to the account today (only sent for waiting claims). */
  signIns: { email: string | null; provider: string | null; status: string | null; createdAt: number | null }[];
  status: ClaimStatus;
  checks: CheckLine[];
  reasons: string[];
  imageUrl: string | null;
  createdAt: number | null;
  expiresAt: number | null;
  decidedAt: number | null;
  decidedBy: string | null;
  note: string | null;
}

export function readClaimQueue(raw: unknown): AdminClaimItem[] {
  return list(raw, "queue", "recent", "claims", "items").flatMap((i) => {
    const o = obj(i);
    if (!o) return [];
    const user = obj(o.user);
    const base = readClaimObj(o);
    return [
      {
        id: base.id,
        claimantEmail: str(pick(o, "claimantEmail", "claimant_email")),
        userName: str(pick(o, "userName", "user_name", "accountName", "account_name")) ?? str(user?.name),
        accountEmail: str(pick(o, "accountEmail", "account_email", "maskedEmail", "masked_email")) ?? str(user?.email),
        docType: base.docType,
        idLast4: base.idLast4,
        maskedId: str(pick(o, "maskedId", "masked_id")),
        signIns: (Array.isArray(o.signIns) ? o.signIns : []).flatMap((x) => {
          const si = obj(x);
          return si
            ? [{ email: str(si.email), provider: str(si.provider), status: str(si.status), createdAt: num(pick(si, "createdAt", "created_at")) }]
            : [];
        }),
        status: base.status,
        checks: readChecks(o.checks),
        reasons: base.reasons,
        imageUrl: photoUrl(o, "/api/v1/admin/recovery", base.id),
        createdAt: base.createdAt,
        expiresAt: base.expiresAt,
        decidedAt: base.decidedAt,
        decidedBy: str(pick(o, "decidedBy", "decided_by")),
        note: base.note,
      },
    ];
  });
}
