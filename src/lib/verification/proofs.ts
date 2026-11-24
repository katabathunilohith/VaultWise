import fs from "node:fs";
import path from "node:path";
import { get, newId, parseJson, run, tx, UPLOAD_DIR } from "../db";
import { audit } from "../audit";
import { customRuleFor } from "../custom-rules";
import { VISION_MODEL } from "../groq";
import type { VaultCategory } from "../shared";
import { HttpError, type User } from "../users";
import { probeImage, sha256 } from "./forensics";
import { PIPELINE_VERSION, STAGE_DEFS, type Extraction, type ProofRow, type Stage, type VerificationRow } from "./types";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

/** Rejects files the pipeline can't read before anything is stored or held. */
export async function validateUpload(buffer: Buffer, mime: string) {
  if (mime === "image/heic" || mime === "image/heif")
    throw new HttpError(
      415,
      "HEIC photos aren't supported yet. Upload a JPEG or PNG — on iPhone, share the photo as JPEG or set Camera → Formats → Most Compatible.",
    );
  if (!ALLOWED_MIME.includes(mime)) throw new HttpError(415, "Upload a photo or scan (JPEG, PNG or WebP)");
  if (buffer.length > MAX_BYTES) throw new HttpError(413, "File is larger than 10 MB");
  if (!(await probeImage(buffer)))
    throw new HttpError(415, "We couldn't read that image. It may be damaged, or in a format we don't support — try a JPEG or PNG.");
}

export function createProof(
  user: User,
  input: {
    buffer: Buffer;
    fileName: string;
    mime: string;
    purpose: ProofRow["purpose"];
    category: VaultCategory;
    vaultId?: string | null;
    withdrawalId?: string | null;
    emergencyId?: string | null;
    /** True only when the person said yes to the AI reading it (lib/ai-consent.ts aiConsented()); false = a person reads it. */
    aiAllowed: boolean; // ai-consent: required, so every caller decides
  },
) {
  if (!ALLOWED_MIME.includes(input.mime)) throw new HttpError(415, "Upload a photo or scan (JPEG, PNG or WebP)");
  if (input.buffer.length > MAX_BYTES) throw new HttpError(413, "File is larger than 10 MB");
  const id = newId("prf");
  const ext = input.mime.split("/")[1].replace("jpeg", "jpg");
  const stored = path.join(UPLOAD_DIR, `${id}.${ext}`);
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(stored, input.buffer);
  const now = Date.now();
  const stages: Stage[] = STAGE_DEFS.map(([key, name]) => ({ key, name, status: "pending", checks: [] }));
  tx(() => {
    run(
      `INSERT INTO proofs (id, user_id, vault_id, withdrawal_id, emergency_id, purpose, category, file_name, mime, size, sha256, stored_path, ai_allowed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      user.id,
      input.vaultId ?? null,
      input.withdrawalId ?? null,
      input.emergencyId ?? null,
      input.purpose,
      input.category,
      input.fileName.slice(0, 200),
      input.mime,
      input.buffer.length,
      sha256(input.buffer),
      stored,
      input.aiAllowed === true ? 1 : 0, // ai-consent: only an explicit yes
      now,
    );
    run(
      "INSERT INTO verifications (id, proof_id, status, stages, model_version, created_at) VALUES (?, ?, 'processing', ?, ?, ?)",
      newId("ver"),
      id,
      JSON.stringify(stages),
      `${PIPELINE_VERSION} · vision=${VISION_MODEL}`,
      now,
    );
    if (input.withdrawalId) run("UPDATE withdrawals SET status = 'verifying', proof_id = ? WHERE id = ?", id, input.withdrawalId);
    if (input.emergencyId)
      run("UPDATE emergency_requests SET receipt_status = 'submitted', receipt_proof_id = ? WHERE id = ?", id, input.emergencyId);
    audit({
      userId: user.id,
      actor: user.id,
      actorType: "user",
      action: "proof.uploaded",
      entityType: "proof",
      entityId: id,
      details: { purpose: input.purpose, category: input.category, size: input.buffer.length, mime: input.mime },
    });
  });
  return id;
}

export function proofView(proofId: string) {
  const proof = get<ProofRow>("SELECT * FROM proofs WHERE id = ?", proofId);
  if (!proof) throw new HttpError(404, "Proof not found");
  const ver = get<VerificationRow>("SELECT * FROM verifications WHERE proof_id = ?", proofId)!;
  const vault = proof.vault_id
    ? get<{ id: string; name: string; category: string }>("SELECT id, name, category FROM vaults WHERE id = ?", proof.vault_id)
    : null;
  const withdrawal = proof.withdrawal_id
    ? get<{ id: string; amount: number; payee: string; status: string }>(
        "SELECT id, amount, payee, status FROM withdrawals WHERE id = ?",
        proof.withdrawal_id,
      )
    : null;
  return {
    id: proof.id,
    purpose: proof.purpose,
    // custom-rules: shown to the reviewer next to the bill.
    customRule: vault ? customRuleFor(vault.id) : null,
    category: proof.category,
    fileName: proof.file_name,
    createdAt: proof.created_at,
    hasEla: !!proof.ela_path,
    exif: parseJson(proof.exif, null),
    extracted: parseJson<Extraction | null>(proof.extracted, null),
    vault,
    withdrawal,
    emergencyId: proof.emergency_id,
    verification: {
      status: ver.status,
      stages: parseJson<Stage[]>(ver.stages, []),
      confidence: ver.confidence,
      decision: ver.decision,
      finalDecision: ver.final_decision,
      reasons: parseJson<string[]>(ver.reasons, []),
      modelVersion: ver.model_version,
      reviewer: ver.reviewer,
      reviewerNote: ver.reviewer_note,
      appealNote: ver.appeal_note,
      queuedAt: ver.queued_at,
      decidedAt: ver.decided_at,
      durationMs: ver.duration_ms,
    },
  };
}
