import fs from "node:fs";
import { all, get, newId, parseJson, run } from "../db";
import { audit } from "../audit";
import { HttpError, type User } from "../users";
import { validateUpload } from "../verification/pipeline";
import { DOC_LABELS, docTypesFor, last4, maskId, validateIdNumber, type DocType } from "./ids";
import { assertIdentitySecret, idHash } from "./secret";
import { completeKycRecord, deleteKycPhoto, deleteKycRecord, ensureKycTables, insertKycRecord, kycRecord, kycSubmissionsSince, latestKycRecord, latestVerifiedRecord, setKycDecision, storeIdImage, type KycRecord } from "./store";
import { externalProvider } from "./providers/external";
import { practiceProvider } from "./providers/practice";
import type { KycCheck, KycProvider, KycResult, KycStatus } from "./types";

/** What the customer sees. "not_started" = no ID submitted and not verified. */
export type KycViewStatus = "not_started" | KycStatus;

export interface KycView {
  status: KycViewStatus;
  docType: DocType | null;
  idLast4: string | null;
  reasons: string[];
  updatedAt: number | null;
}

const PROVIDERS: Record<string, KycProvider> = { practice: practiceProvider, external: externalProvider };
let providerOverride: KycProvider | null = null;

/** Tests (or a future admin switch) can force a provider. Pass null to use KYC_PROVIDER again. */
export function setKycProvider(p: KycProvider | null) {
  providerOverride = p;
}

/** KYC_PROVIDER picks the provider ("practice" by default). */
export function kycProvider(): KycProvider {
  if (providerOverride) return providerOverride;
  return PROVIDERS[process.env.KYC_PROVIDER?.trim() || "practice"] ?? practiceProvider;
}

const LIMIT_PER_DAY = 5;

export function kycView(user: User): KycView {
  const rec = latestKycRecord(user.id);
  if (user.kyc_status === "verified") {
    const v = latestVerifiedRecord(user.id);
    return { status: "verified", docType: v?.doc_type ?? null, idLast4: v?.id_last4 ?? null, reasons: [], updatedAt: v ? (v.decided_at ?? v.created_at) : null };
  }
  if (!rec) return { status: "not_started", docType: null, idLast4: null, reasons: [], updatedAt: null };
  return {
    status: rec.status,
    docType: rec.doc_type,
    idLast4: rec.id_last4,
    reasons: parseJson<string[]>(rec.reasons, []),
    updatedAt: rec.decided_at ?? rec.created_at,
  };
}

/** The short form for /api/v1/me. */
export function kycSummary(user: User): { status: KycViewStatus; docType?: string; idLast4?: string } {
  const v = kycView(user);
  return { status: v.status, ...(v.docType ? { docType: v.docType } : {}), ...(v.idLast4 ? { idLast4: v.idLast4 } : {}) };
}

const LEVEL: Record<KycStatus, number> = { verified: 2, pending: 1, needs_review: 1, rejected: 0 };

function setUserKyc(userId: string, status: KycStatus) {
  run("UPDATE users SET kyc_status = ?, kyc_level = ? WHERE id = ?", status, LEVEL[status], userId);
}

export async function submitKyc(user: User, input: { docType: string; file: { buffer: Buffer; mime: string }; idNumber?: string | null }): Promise<KycView> {
  assertIdentitySecret();
  const accepted = docTypesFor(user.jurisdiction);
  if (!accepted.includes(input.docType as DocType))
    throw new HttpError(400, `Choose one of: ${accepted.map((d) => DOC_LABELS[d]).join(", ")}.`, "doc_type_not_accepted");
  const docType = input.docType as DocType;
  if (user.kyc_status === "verified") throw new HttpError(409, "Your ID is already verified.", "kyc_done");
  const latest = latestKycRecord(user.id);
  if (latest && (latest.status === "needs_review" || latest.status === "pending"))
    throw new HttpError(409, "We're already checking your ID. We'll let you know when it's done.", "kyc_in_review");
  if (kycSubmissionsSince(user.id, Date.now() - 86_400_000) >= LIMIT_PER_DAY)
    throw new HttpError(429, "Too many tries today. Try again tomorrow.", "rate_limited");
  if (input.idNumber && input.idNumber.trim()) {
    const v = validateIdNumber(docType, input.idNumber, user.jurisdiction);
    if (!v.ok) throw new HttpError(400, v.reason, "invalid_id");
  }

  // Reserve the row before any await, so a parallel submission sees "pending" (409 kyc_in_review)
  // and counts toward the daily limit. Removed again if the upload or the provider fails.
  const provider = kycProvider();
  const id = newId("kyc");
  const now = Date.now();
  insertKycRecord({
    id,
    user_id: user.id,
    doc_type: docType,
    id_last4: null,
    id_hash: null,
    name_on_doc: null,
    dob: null,
    status: "pending",
    provider: provider.name,
    checks: [],
    reasons: [],
    file_path: null,
    decided_by: null,
    decided_at: null,
    created_at: now,
  });
  let result: KycResult;
  try {
    await validateUpload(input.file.buffer, input.file.mime);
    result = await provider.verify({
      user: { id: user.id, name: user.name, market: user.jurisdiction },
      docType,
      file: input.file,
      idNumber: input.idNumber ?? null,
    });
  } catch (e) {
    deleteKycRecord(id);
    throw e;
  }
  const done = Date.now();
  const decided = result.status === "verified" || result.status === "rejected";
  // A rejected check keeps no photo; see README for retention of the others.
  const filePath = result.status === "rejected" ? null : storeIdImage("kyc", id, input.file);
  const completed = completeKycRecord(id, {
    id_last4: result.number ? last4(result.number) : null,
    id_hash: result.number ? idHash(docType, result.number) : null,
    name_on_doc: result.nameOnDoc,
    dob: result.dob,
    status: result.status,
    checks: result.checks,
    reasons: result.reasons,
    file_path: filePath,
    decided_by: decided ? `kyc:${provider.name}` : null,
    decided_at: decided ? done : null,
  });
  if (!completed) {
    // A person decided while the check ran; their decision stands.
    if (filePath) fs.rmSync(filePath, { force: true });
    return kycView(get<User>("SELECT * FROM users WHERE id = ?", user.id)!);
  }
  setUserKyc(user.id, result.status);
  audit({
    userId: user.id,
    actor: user.id,
    actorType: "user",
    action: "kyc.submitted",
    entityType: "kyc",
    entityId: id,
    details: { docType, idLast4: result.number ? last4(result.number) : null, provider: provider.name },
    ts: done,
  });
  audit({
    userId: user.id,
    actor: `kyc:${provider.name}`,
    actorType: "system",
    action: `kyc.${result.status}`,
    entityType: "kyc",
    entityId: id,
    details: { checks: result.checks.map((c) => `${c.label}: ${c.status}`), reasons: result.reasons },
    ts: done + 1,
  });
  return kycView(get<User>("SELECT * FROM users WHERE id = ?", user.id)!);
}

/** The reviewer's queue: checks waiting for a person, oldest first, plus recent decisions. */
export function kycQueue() {
  ensureKycTables();
  const rows = all<KycRecord & { user_name: string; user_email: string | null; jurisdiction: string; account_kyc: string }>(
    `SELECT k.*, u.name AS user_name, u.email AS user_email, u.jurisdiction, u.kyc_status AS account_kyc
     FROM kyc_records k JOIN users u ON u.id = k.user_id
     WHERE k.status = 'needs_review' OR (k.status = 'pending' AND k.checks != '[]') ORDER BY k.created_at ASC`,
  );
  const recent = all<KycRecord & { user_name: string }>(
    `SELECT k.*, u.name AS user_name FROM kyc_records k JOIN users u ON u.id = k.user_id
     WHERE k.status IN ('verified', 'rejected') ORDER BY COALESCE(k.decided_at, k.created_at) DESC LIMIT 20`,
  );
  const view = (k: KycRecord & { user_name: string }) => ({
    id: k.id,
    userId: k.user_id,
    userName: k.user_name,
    docType: k.doc_type,
    idLast4: k.id_last4,
    maskedId: maskId(k.doc_type, k.id_last4),
    nameOnDoc: k.name_on_doc,
    dob: k.dob,
    status: k.status,
    provider: k.provider,
    checks: parseJson<KycCheck[]>(k.checks, []),
    reasons: parseJson<string[]>(k.reasons, []),
    hasFile: !!k.file_path,
    createdAt: k.created_at,
    decidedAt: k.decided_at,
    decidedBy: k.decided_by,
  });
  return {
    queue: rows.map((k) => ({ ...view(k), userEmail: k.user_email, market: k.jurisdiction })),
    recent: recent.map(view),
  };
}

export function decideKyc(id: string, decision: "verified" | "rejected", reviewer: string, note: string) {
  const rec = kycRecord(id);
  if (!rec) throw new HttpError(404, "Not found");
  if (rec.status !== "needs_review" && rec.status !== "pending") throw new HttpError(409, "This check was already decided.", "already_decided");
  const now = Date.now();
  // A rejection's note is what the customer is told, so it should say what to do next.
  setKycDecision(id, decision, reviewer, now, decision === "rejected" ? [note] : []);
  if (decision === "rejected") deleteKycPhoto(id);
  setUserKyc(rec.user_id, decision);
  audit({
    userId: rec.user_id,
    actor: reviewer,
    actorType: "reviewer",
    action: `kyc.${decision}`,
    entityType: "kyc",
    entityId: id,
    details: { note, docType: rec.doc_type, idLast4: rec.id_last4 },
    ts: now,
  });
  return kycRecord(id)!;
}
