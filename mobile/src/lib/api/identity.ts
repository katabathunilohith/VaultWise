/**
 * Identity API (live): sign-in session, KYC and account recovery. The identity module adds its
 * methods here; client.ts spreads them into `live`, and demo/identity.ts implements them for Practice.
 *
 * ID numbers are sent once, in the request that checks them, and never kept on the phone. Answers
 * only ever carry the last 4 characters.
 */
import * as Crypto from "expo-crypto";
import { getItem, setItem } from "../storage";
import { formWith, request } from "./http";
import type {
  ClaimInput,
  ClaimStatus,
  FindAccountInput,
  FindAccountResult,
  IdDocType,
  IdSubmission,
  KycInput,
  KycStatus,
  KycView,
  RecoveryClaim,
  ResetInput,
  ResetResult,
} from "./identity-types";

/* ---------- this install's id (rate limits on the signed-out recovery routes) ---------- */

const DEVICE_ID_KEY = "vw.deviceId";
let deviceId: Promise<string> | null = null;

/** A random id for this install, sent as `x-device-id` so the server can count tries per phone. */
function installId(): Promise<string> {
  deviceId ??= (async () => {
    const saved = await getItem(DEVICE_ID_KEY);
    if (saved) return saved;
    const id = Crypto.randomUUID();
    await setItem(DEVICE_ID_KEY, id);
    return id;
  })().catch(() => "unknown");
  return deviceId;
}

/* ---------- forms ---------- */

/** The multipart form the KYC and recovery routes read: docType, optional file, optional idNumber. */
async function idForm({ docType, file, idNumber }: IdSubmission): Promise<FormData> {
  const fields: Record<string, string> = { docType };
  const typed = idNumber?.trim();
  if (typed) fields.idNumber = typed;
  if (file) return formWith(file, fields);
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return form;
}

/* ---------- answers, read defensively ---------- */

const KYC_STATUSES: KycStatus[] = ["not_started", "pending", "needs_review", "verified", "rejected"];
const CLAIM_STATUSES: ClaimStatus[] = ["pending", "approved", "rejected", "cancelled", "expired"];

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const reasonsOf = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .map((r) => (typeof r === "string" ? r : str((r as { message?: unknown; detail?: unknown })?.message) ?? str((r as { detail?: unknown })?.detail)))
        .filter((r): r is string => !!r)
    : [];

export function toKycView(raw: unknown): KycView {
  const r = (raw ?? {}) as Record<string, unknown>;
  const status = KYC_STATUSES.includes(r.status as KycStatus) ? (r.status as KycStatus) : "not_started";
  return {
    status,
    docType: (str(r.docType) as IdDocType | null) ?? null,
    idLast4: str(r.idLast4),
    reasons: reasonsOf(r.reasons),
    updatedAt: num(r.updatedAt),
  };
}

/** A claim from `{ claim: {...} }`, the claim itself, or null when there is none. */
export function toClaim(raw: unknown): RecoveryClaim | null {
  if (!raw || typeof raw !== "object") return null;
  const outer = raw as Record<string, unknown>;
  const r = (outer.claim !== undefined ? outer.claim : outer) as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const id = str(r.id) ?? str(r.claimId);
  if (!id) return null;
  return {
    id,
    status: CLAIM_STATUSES.includes(r.status as ClaimStatus) ? (r.status as ClaimStatus) : "pending",
    access: r.access === "read_only" || r.access === "after_approval" ? r.access : null,
    docType: (str(r.docType) as IdDocType | null) ?? null,
    idLast4: str(r.idLast4),
    reasons: reasonsOf(r.reasons),
    notifiedEmail: str(r.notifiedEmail),
    createdAt: num(r.createdAt) ?? Date.now(),
    decidedAt: num(r.decidedAt),
    expiresAt: num(r.expiresAt),
  };
}

/* ---------- the API ---------- */

export const identityLive = {
  /** Where this account's ID check is. */
  kyc: async (): Promise<KycView> => toKycView(await request<unknown>("/kyc")),
  /** Sends an ID to be checked. The answer is the check's outcome (or that a person will look). */
  submitKyc: async (input: KycInput): Promise<KycView> => toKycView(await request<unknown>("/kyc", { method: "POST", body: await idForm(input) })),
  /** Signed out: looks for the account that verified this ID. 5 tries an hour per phone. */
  findAccount: async (input: FindAccountInput): Promise<FindAccountResult> => {
    const r = await request<FindAccountResult>("/recovery/find", {
      method: "POST",
      body: await idForm(input),
      headers: { "x-device-id": await installId() },
    });
    return { found: !!r?.found, maskedEmail: r?.maskedEmail || undefined, canReset: !!r?.canReset, findToken: r?.findToken || undefined };
  },
  /** Asks for a password-reset email. Always answers ok, whether or not the account exists. */
  resetPassword: async (input: ResetInput): Promise<ResetResult> => {
    const r = await request<ResetResult | null>("/recovery/reset", {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "x-device-id": await installId() },
    });
    return { ok: true, simulated: !!r?.simulated };
  },
  /** The signed-in person's latest recovery request, if any. */
  recoveryClaim: async (): Promise<RecoveryClaim | null> => toClaim(await request<unknown>("/recovery/claim")),
  /** A new login asks for an existing account back, by showing the ID that account verified. */
  submitClaim: async (input: ClaimInput): Promise<RecoveryClaim | null> =>
    toClaim(await request<unknown>("/recovery/claim", { method: "POST", body: await idForm(input), headers: { "x-device-id": await installId() } })),
  cancelClaim: async (): Promise<{ ok: true }> => {
    await request<unknown>("/recovery/claim", { method: "DELETE" });
    return { ok: true };
  },
};
