import fs from "node:fs";
import path from "node:path";
import { all, get, newId, parseJson, run, tx, UPLOAD_DIR } from "../db";
import { audit } from "../audit";
import { rulesFor } from "../compliance";
import { AiError, aiEnabled, chatJson, describeAiError, VISION_MODEL } from "../groq";
import { CATEGORIES, fmtMoney, type VaultCategory } from "../shared";
import { HttpError, type User } from "../users";
import { payoutWithdrawal } from "../vaults";
import { raiseFlag } from "../fraud";
import {
  dHash,
  EDITING_SOFTWARE,
  ELA_MAX_PIXELS,
  errorLevelAnalysis,
  hamming,
  preprocess,
  probeImage,
  readExif,
  sha256,
  type ExifSummary,
} from "./forensics";
import { acceptedCategories, keywordScores } from "./classify";

export const PIPELINE_VERSION = "vw-proof@1.4";

export type StageStatus = "pending" | "running" | "passed" | "warning" | "failed" | "skipped";
export interface Check {
  label: string;
  status: "pass" | "warn" | "fail" | "info";
  detail: string;
}
export interface Stage {
  key: string;
  name: string;
  status: StageStatus;
  score?: number;
  startedAt?: number;
  finishedAt?: number;
  summary?: string;
  checks: Check[];
  data?: Record<string, unknown>;
}

const STAGE_DEFS: [string, string][] = [
  ["intake", "Upload & integrity"],
  ["preprocess", "Pre-processing & forensics"],
  ["extract", "OCR & layout understanding"],
  ["classify", "Purpose classification"],
  ["tamper", "Tamper & reuse detection"],
  ["decision", "Decision & audit trail"],
];

export interface Extraction {
  is_document: boolean;
  document_type: string;
  issuer: string | null;
  recipient_name: string | null;
  document_date: string | null;
  total_amount: number | null;
  subtotal: number | null;
  tax: number | null;
  currency: string | null;
  reference_number: string | null;
  line_items: { description: string; amount: number | null }[];
  category_scores: Record<string, number>;
  purpose_match: number;
  editing_signs: string[];
  legibility: number;
  text: string;
  summary: string;
}

export interface ProofRow {
  id: string;
  user_id: string;
  vault_id: string | null;
  withdrawal_id: string | null;
  emergency_id: string | null;
  purpose: "withdrawal" | "emergency_receipt";
  category: VaultCategory;
  file_name: string;
  mime: string;
  size: number;
  sha256: string;
  phash: string | null;
  stored_path: string;
  ela_path: string | null;
  exif: string | null;
  extracted: string | null;
  created_at: number;
}

export interface VerificationRow {
  id: string;
  proof_id: string;
  status: "processing" | "complete" | "error";
  stages: string;
  confidence: number | null;
  decision: "auto_approved" | "auto_denied" | "human_review" | null;
  final_decision: "approved" | "denied" | "appealed" | null;
  reasons: string | null;
  model_version: string | null;
  reviewer: string | null;
  reviewer_note: string | null;
  appeal_note: string | null;
  queued_at: number | null;
  decided_at: number | null;
  duration_ms: number | null;
  created_at: number;
}

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
      `INSERT INTO proofs (id, user_id, vault_id, withdrawal_id, emergency_id, purpose, category, file_name, mime, size, sha256, stored_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

function saveStages(proofId: string, stages: Stage[]) {
  run("UPDATE verifications SET stages = ? WHERE proof_id = ?", JSON.stringify(stages), proofId);
}

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

function extractionPrompt(ctx: {
  category: VaultCategory;
  vaultName: string;
  amount: number | null;
  currency: string;
  userName: string;
  today: string;
}) {
  return `You are the document-understanding stage of a savings app's proof-of-purpose verifier.
The user is withdrawing ${ctx.amount != null ? fmtMoney(ctx.amount, ctx.currency) : "funds"} from a vault named "${ctx.vaultName}" (category: ${CATEGORIES[ctx.category].label}). Today is ${ctx.today}.
Read the image and return JSON with exactly these keys:
- is_document: boolean — true only if this is a real bill/receipt/invoice/agreement/statement (not a selfie, meme, blank page or unrelated photo)
- document_type: short snake_case type, e.g. medical_invoice, pharmacy_receipt, tuition_invoice, rent_receipt, lease_agreement, utility_bill, repair_invoice, travel_booking, pension_statement, retail_receipt, other
- issuer: issuing organisation or null
- recipient_name: person billed / patient / student / tenant, or null
- document_date: ISO date YYYY-MM-DD or null
- total_amount: final total due/paid as a number (no currency symbol) or null
- subtotal: subtotal before tax as a number, or null
- tax: tax amount as a number, or null
- currency: ISO 4217 code or null
- reference_number: invoice/receipt number or null
- line_items: array of {description, amount} for the itemised charges only (exclude subtotal, tax and total rows)
- category_scores: object with keys health, education, housing, emergency, retirement, other — each 0..1, how well the document fits that savings purpose
- purpose_match: 0..1 — how plausibly this document justifies spending from a vault named "${ctx.vaultName}"
- editing_signs: array of visual signs of digital alteration (mismatched fonts or sizes, misaligned digits, inconsistent background or blur around numbers, totals that don't add up). Empty if none.
- legibility: 0..1
- text: the document's key text, max 600 characters
- summary: one plain sentence describing the document
Return JSON only.`;
}

/** Normalised content fingerprints used to spot the same document being reused. */
function contentKeys(x: Partial<Extraction>) {
  const norm = (v: unknown) =>
    String(v ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const issuer = norm(x.issuer);
  const keys: string[] = [];
  if (!issuer) return keys;
  const ref = norm(x.reference_number);
  if (ref.length >= 3) keys.push(`ref:${issuer}:${ref}`);
  if (x.total_amount != null && x.document_date) keys.push(`amt:${issuer}:${Number(x.total_amount).toFixed(2)}:${x.document_date}`);
  return keys;
}

/** Runs all six stages, persisting progress so the client can watch it live. */
export async function runPipeline(proofId: string) {
  const t0 = Date.now();
  const proof = get<ProofRow>("SELECT * FROM proofs WHERE id = ?", proofId);
  if (!proof) return;
  const user = get<User>("SELECT * FROM users WHERE id = ?", proof.user_id)!;
  const rules = rulesFor(user.jurisdiction);
  const vault = proof.vault_id
    ? get<{ name: string; template: VaultCategory }>("SELECT name, template FROM vaults WHERE id = ?", proof.vault_id)
    : undefined;
  const withdrawal = proof.withdrawal_id
    ? get<{ amount: number; payee: string }>("SELECT amount, payee FROM withdrawals WHERE id = ?", proof.withdrawal_id)
    : undefined;
  const emergency = proof.emergency_id
    ? get<{ amount: number }>("SELECT amount FROM emergency_requests WHERE id = ?", proof.emergency_id)
    : undefined;
  const requested = withdrawal?.amount ?? emergency?.amount ?? null;
  const template: VaultCategory = vault?.template ?? proof.category;
  const vaultName = vault?.name ?? "Emergency";

  const ver = get<VerificationRow>("SELECT * FROM verifications WHERE proof_id = ?", proofId)!;
  const stages = parseJson<Stage[]>(ver.stages, []);
  const S = (key: string) => stages.find((s) => s.key === key)!;
  const begin = (key: string) => {
    const s = S(key);
    s.status = "running";
    s.startedAt = Date.now();
    saveStages(proofId, stages);
    return s;
  };
  const finish = (s: Stage) => {
    s.finishedAt = Date.now();
    if (s.status === "running") {
      s.status = s.checks.some((c) => c.status === "fail") ? "failed" : s.checks.some((c) => c.status === "warn") ? "warning" : "passed";
    }
    saveStages(proofId, stages);
  };

  const buffer = fs.readFileSync(proof.stored_path);
  const hardFails: string[] = [];
  const reviewReasons: string[] = [];
  const flags: { severity: "low" | "medium" | "high"; text: string }[] = [];

  try {
    // 1 — Intake: type, size, exact-duplicate check across every account.
    const intake = begin("intake");
    intake.checks.push({ label: "File type", status: "pass", detail: `${proof.mime}, ${(proof.size / 1024).toFixed(0)} KB` });
    const exactDup = get<{ id: string; user_id: string }>(
      "SELECT id, user_id FROM proofs WHERE sha256 = ? AND id != ? ORDER BY created_at LIMIT 1",
      proof.sha256,
      proof.id,
    );
    if (exactDup) {
      const cross = exactDup.user_id !== proof.user_id;
      intake.checks.push({
        label: "Exact duplicate",
        status: "fail",
        detail: `Byte-identical to proof ${exactDup.id}${cross ? " submitted by another account" : ""}`,
      });
      hardFails.push("This exact file was already used as proof");
      flags.push({ severity: "high", text: `Exact duplicate of proof ${exactDup.id}${cross ? " (cross-account)" : ""}` });
    } else {
      intake.checks.push({ label: "Exact duplicate", status: "pass", detail: "SHA-256 not seen before" });
    }
    intake.data = { sha256: proof.sha256 };
    intake.score = exactDup ? 0 : 1;
    finish(intake);

    // 2 — Pre-processing & metadata forensics.
    const pre = begin("preprocess");
    const processed = await preprocess(buffer);
    const exif: ExifSummary = await readExif(buffer);
    pre.checks.push({
      label: "Normalised",
      status: "pass",
      detail: `Auto-oriented, trimmed, contrast-normalised, denoised (${processed.original.width}×${processed.original.height} → ${processed.processed.width}×${processed.processed.height})`,
    });
    if (Math.min(processed.original.width, processed.original.height) < 300) {
      pre.checks.push({ label: "Resolution", status: "warn", detail: "Image is very small; fields may be unreadable" });
    }
    if (!exif.present) {
      pre.checks.push({ label: "Metadata", status: "info", detail: "No EXIF metadata (common for scans and screenshots)" });
    } else {
      pre.checks.push({
        label: "Metadata",
        status: "info",
        detail: [exif.make, exif.model].filter(Boolean).join(" ") || "EXIF present",
      });
      if (exif.software && EDITING_SOFTWARE.test(exif.software)) {
        pre.checks.push({ label: "Editing software", status: "warn", detail: `Saved by "${exif.software}"` });
        flags.push({ severity: "medium", text: `Proof saved by editing software (${exif.software})` });
      }
      if (exif.dateTimeOriginal && exif.modifyDate) {
        const gapH = (new Date(exif.modifyDate).getTime() - new Date(exif.dateTimeOriginal).getTime()) / 3_600_000;
        if (gapH > 24)
          pre.checks.push({ label: "Modified after capture", status: "warn", detail: `File modified ${gapH.toFixed(0)}h after it was captured` });
      }
    }
    pre.data = { exif, original: processed.original };
    pre.score = pre.checks.some((c) => c.status === "warn") ? 0.6 : 1;
    run("UPDATE proofs SET exif = ? WHERE id = ?", JSON.stringify(exif), proof.id);
    finish(pre);

    // 3 — Document understanding (vision model).
    const ext = begin("extract");
    let x: Extraction | null = null;
    if (!aiEnabled()) {
      ext.status = "skipped";
      ext.summary = "Vision model unavailable — routing to a human reviewer";
      ext.checks.push({ label: "Vision model", status: "warn", detail: "GROQ_API_KEY not configured" });
    } else {
      try {
        x = await chatJson<Extraction>(
          [
            {
              role: "system",
              content: "You extract structured fields from financial documents. Respond with a single JSON object.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: extractionPrompt({
                    category: template,
                    vaultName,
                    amount: requested,
                    currency: user.currency,
                    userName: user.name,
                    today: new Date().toISOString().slice(0, 10),
                  }),
                },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${processed.buffer.toString("base64")}` } },
              ],
            },
          ],
          { model: VISION_MODEL, temperature: 0, maxTokens: 900, timeoutMs: 60_000 },
        );
        x.category_scores ??= {};
        x.editing_signs ??= [];
        x.line_items ??= [];
        x.legibility = clamp(Number(x.legibility ?? 0.5));
        x.purpose_match = clamp(Number(x.purpose_match ?? 0));
        const num = (v: unknown) => (v == null || v === "" ? null : Number(String(v).replace(/[^\d.-]/g, "")) || null);
        x.total_amount = num(x.total_amount);
        x.subtotal = num(x.subtotal);
        x.tax = num(x.tax);
        x.line_items = x.line_items.map((l) => ({ description: String(l.description ?? ""), amount: num(l.amount) }));
        run("UPDATE proofs SET extracted = ? WHERE id = ?", JSON.stringify(x), proof.id);
        const found = [x.issuer, x.document_date, x.total_amount != null ? "amount" : null, x.document_type].filter(Boolean).length;
        ext.checks.push({ label: "Document detected", status: x.is_document ? "pass" : "fail", detail: x.summary || x.document_type });
        ext.checks.push({
          label: "Fields extracted",
          status: found >= 3 ? "pass" : "warn",
          detail: `${found}/4 key fields · legibility ${(x.legibility * 100).toFixed(0)}%`,
        });
        if (!x.is_document) hardFails.push("The upload doesn't appear to be a bill, receipt or agreement");
        ext.score = clamp((x.is_document ? 0.5 : 0) + (found / 4) * 0.3 + x.legibility * 0.2);
        ext.data = {
          documentType: x.document_type,
          issuer: x.issuer,
          recipient: x.recipient_name,
          date: x.document_date,
          total: x.total_amount,
          currency: x.currency,
          reference: x.reference_number,
          lineItems: x.line_items.slice(0, 8),
        };
      } catch (e) {
        ext.status = "failed";
        ext.summary = "Vision model call failed — routing to a human reviewer";
        if (!(e instanceof AiError)) console.warn("[verify] vision step", e);
        ext.checks.push({ label: "Vision model", status: "fail", detail: describeAiError(e) });
      }
    }
    finish(ext);

    // 4 — Purpose classification + business-rule checks.
    const cls = begin("classify");
    let matchScore = 0.5;
    let amountScore = 0.5;
    let dateScore = 0.5;
    let nameScore = 0.7;
    let arithmetic: "ok" | "minor" | "mismatch" | "unknown" = "unknown";
    if (x) {
      const kw = keywordScores(`${x.document_type} ${x.issuer ?? ""} ${x.text ?? ""} ${x.line_items.map((l) => l.description).join(" ")}`);
      const accepted = acceptedCategories(template);
      const llm = template === "custom" ? x.purpose_match : Math.max(...accepted.map((c) => clamp(Number(x!.category_scores[c] ?? 0))));
      const kwScore = template === "custom" ? x.purpose_match : Math.max(...accepted.map((c) => kw[c] ?? 0));
      matchScore = template === "custom" ? x.purpose_match : 0.6 * llm + 0.25 * kwScore + 0.15 * x.purpose_match;
      const kwHits = accepted.flatMap((c) => kw.hits[c] ?? []);
      cls.checks.push({
        label: `Matches ${CATEGORIES[template].label}`,
        status: matchScore >= 0.7 ? "pass" : matchScore >= 0.4 ? "warn" : "fail",
        detail:
          template === "custom"
            ? `Purpose fit for "${vaultName}": ${(x.purpose_match * 100).toFixed(0)}% (custom vault — strictest tier)`
            : `Model ${(llm * 100).toFixed(0)}% · keywords ${(kwScore * 100).toFixed(0)}%${kwHits.length ? ` (${kwHits.slice(0, 5).join(", ")})` : ""}`,
      });
      if (matchScore < 0.2 && x.is_document) hardFails.push(`The document doesn't match the ${CATEGORIES[template].label} purpose`);

      if (requested != null && x.total_amount != null) {
        const docMinor = Math.round(x.total_amount * 100);
        if (docMinor >= requested * 0.98) {
          amountScore = 1;
          cls.checks.push({
            label: "Amount covered",
            status: "pass",
            detail: `Document total ${fmtMoney(docMinor, user.currency)} ≥ requested ${fmtMoney(requested, user.currency)}`,
          });
        } else {
          amountScore = clamp(docMinor / requested) * 0.6;
          cls.checks.push({
            label: "Amount covered",
            status: "fail",
            detail: `Document total ${fmtMoney(docMinor, user.currency)} is less than requested ${fmtMoney(requested, user.currency)}`,
          });
        }
      } else {
        cls.checks.push({ label: "Amount covered", status: "warn", detail: "No total could be read from the document" });
      }

      // Do the itemised charges add up to the stated total?
      const items = x.line_items.map((l) => l.amount).filter((a): a is number => a != null && a > 0);
      if (x.total_amount != null && items.length >= 2) {
        const itemSum = items.reduce((a, b) => a + b, 0);
        const candidates = [itemSum, itemSum + (x.tax ?? 0), (x.subtotal ?? itemSum) + (x.tax ?? 0)];
        const gap = Math.min(...candidates.map((c) => Math.abs(c - x!.total_amount!))) / Math.max(1, x.total_amount);
        arithmetic = gap <= 0.02 ? "ok" : gap <= 0.25 ? "minor" : "mismatch";
        cls.checks.push({
          label: "Totals add up",
          status: arithmetic === "ok" ? "pass" : arithmetic === "minor" ? "warn" : "fail",
          detail:
            arithmetic === "ok"
              ? `Line items reconcile to the total`
              : `Line items sum to ${itemSum.toFixed(2)} but the total reads ${x.total_amount.toFixed(2)}`,
        });
        if (arithmetic === "mismatch") flags.push({ severity: "high", text: "Document total doesn't match its own line items" });
      }

      if (x.document_date) {
        const ageDays = (Date.now() - new Date(x.document_date).getTime()) / 86_400_000;
        if (ageDays < -2) {
          dateScore = 0;
          cls.checks.push({ label: "Document date", status: "fail", detail: `Dated in the future (${x.document_date})` });
          hardFails.push("The document is dated in the future");
        } else if (ageDays > rules.verification.maxDocAgeDays) {
          dateScore = 0.2;
          cls.checks.push({
            label: "Document date",
            status: "fail",
            detail: `${Math.round(ageDays)} days old (policy: ${rules.verification.maxDocAgeDays})`,
          });
        } else {
          dateScore = 1;
          cls.checks.push({
            label: "Document date",
            status: "pass",
            detail: `${x.document_date} · within ${rules.verification.maxDocAgeDays}-day window`,
          });
        }
      } else {
        cls.checks.push({ label: "Document date", status: "warn", detail: "No date found" });
      }

      if (x.recipient_name) {
        const parts = user.name
          .toLowerCase()
          .split(/\s+/)
          .filter((p) => p.length > 1);
        const onDoc = x.recipient_name.toLowerCase();
        const first = parts.length > 0 && onDoc.includes(parts[0]);
        const family = parts.length > 1 && onDoc.includes(parts.at(-1)!);
        nameScore = first ? 1 : family ? 0.6 : 0.35;
        cls.checks.push({
          label: "Name on document",
          status: first ? "pass" : "warn",
          detail: first
            ? `"${x.recipient_name}" matches the account holder`
            : family
              ? `"${x.recipient_name}" shares the account holder's surname — likely a dependant`
              : `"${x.recipient_name}" doesn't match the account holder; reviewer may confirm a dependant`,
        });
      }
      if (x.currency && x.currency !== user.currency) {
        cls.checks.push({ label: "Currency", status: "warn", detail: `Document in ${x.currency}, wallet in ${user.currency}` });
      }
    } else {
      cls.status = "skipped";
      cls.summary = "Needs extracted fields — deferred to reviewer";
    }
    cls.score = matchScore;
    cls.data = { matchScore, amountScore, dateScore, nameScore, template };
    finish(cls);

    // 5 — Tamper detection & document reuse.
    const tam = begin("tamper");
    const elaResult = await errorLevelAnalysis(buffer);
    // Very large photos skip ELA (memory-bound); reuse, metadata, arithmetic and visual checks still apply.
    const ela = elaResult ?? { score: 0, largestCluster: 0, texturedBlocks: 0, heatmap: null };
    const elaPath = elaResult ? proof.stored_path.replace(/\.[a-z]+$/, "_ela.png") : null;
    if (elaResult && elaPath) fs.writeFileSync(elaPath, elaResult.heatmap);
    const phash = await dHash(buffer);
    run("UPDATE proofs SET phash = ?, ela_path = ? WHERE id = ?", phash, elaPath, proof.id);
    tam.checks.push(
      elaResult
        ? {
            label: "Error level analysis",
            status: ela.score >= 0.5 ? "fail" : ela.score >= 0.2 ? "warn" : "pass",
            detail: `Anomaly ${(ela.score * 100).toFixed(0)}% · largest inconsistent region ${ela.largestCluster} blocks of ${ela.texturedBlocks}`,
          }
        : {
            label: "Error level analysis",
            status: "info",
            detail: `Skipped — the photo is above the ${ELA_MAX_PIXELS / 1_000_000} MP analysis limit; other tamper checks still applied`,
          },
    );
    if (ela.score >= 0.5)
      flags.push({ severity: "medium", text: `ELA found a localised compression inconsistency (${(ela.score * 100).toFixed(0)}%)` });

    // Reuse: the same document content (issuer + reference, or issuer + total + date)
    // already backed another withdrawal, or a visually near-identical upload.
    const myKeys = x ? contentKeys(x) : [];
    const priors = all<{ id: string; phash: string | null; user_id: string; extracted: string | null }>(
      "SELECT id, phash, user_id, extracted FROM proofs WHERE id != ? AND sha256 != ? AND (phash IS NOT NULL OR extracted IS NOT NULL)",
      proof.id,
      proof.sha256,
    );
    let contentDup: { id: string; cross: boolean } | null = null;
    let nearest: { id: string; d: number; cross: boolean; sameContent: boolean } | null = null;
    for (const o of priors) {
      const theirs = o.extracted ? contentKeys(parseJson<Extraction>(o.extracted, {} as Extraction)) : [];
      const sameContent = myKeys.some((k) => theirs.includes(k));
      if (sameContent && !contentDup) contentDup = { id: o.id, cross: o.user_id !== proof.user_id };
      if (o.phash && o.phash.length === phash.length) {
        const d = hamming(phash, o.phash);
        if (!nearest || d < nearest.d) nearest = { id: o.id, d, cross: o.user_id !== proof.user_id, sameContent };
      }
    }
    if (contentDup) {
      tam.checks.push({
        label: "Document reuse",
        status: "fail",
        detail: `Same issuer and reference/amount/date as proof ${contentDup.id}${contentDup.cross ? " from another account" : ""}`,
      });
      hardFails.push("This document was already used to justify another withdrawal");
      flags.push({ severity: "high", text: `Document content reused from proof ${contentDup.id}${contentDup.cross ? " (cross-account)" : ""}` });
    } else if (nearest && nearest.d <= 10 && !x) {
      tam.checks.push({
        label: "Document reuse",
        status: "fail",
        detail: `Visually near-identical to proof ${nearest.id} (${nearest.d}/256 bits) and content unreadable`,
      });
      reviewReasons.push("Looks like a previously submitted document");
    } else {
      tam.checks.push({
        label: "Document reuse",
        status: "pass",
        detail: nearest && nearest.d <= 24 ? `Same layout as proof ${nearest.id}, but different content` : "No matching prior documents",
      });
    }

    let exifScore = 0;
    if (x?.document_date && exif.dateTimeOriginal) {
      const lagDays = (new Date(x.document_date).getTime() - new Date(exif.dateTimeOriginal).getTime()) / 86_400_000;
      if (lagDays > 7) {
        exifScore = 0.7;
        tam.checks.push({
          label: "Timestamp consistency",
          status: "fail",
          detail: `Photo captured ${Math.round(lagDays)} days before the document's own date`,
        });
        flags.push({ severity: "medium", text: "Capture timestamp predates the document date" });
      } else {
        tam.checks.push({ label: "Timestamp consistency", status: "pass", detail: "Capture time is consistent with the document date" });
      }
    }
    if (exif.software && EDITING_SOFTWARE.test(exif.software)) exifScore = Math.max(exifScore, 0.5);

    const signs = x?.editing_signs ?? [];
    tam.checks.push({
      label: "Visual edit signs",
      status: signs.length >= 2 ? "fail" : signs.length === 1 ? "warn" : "pass",
      detail: signs.length ? signs.slice(0, 3).join("; ") : x ? "None noticed by the vision model" : "Not assessed",
    });
    const arithScore = arithmetic === "mismatch" ? 0.6 : arithmetic === "minor" ? 0.15 : 0;
    const tamperScore = 1 - (1 - ela.score * 0.85) * (1 - exifScore) * (1 - Math.min(1, signs.length * 0.3)) * (1 - arithScore);
    if (tamperScore >= 0.8) {
      hardFails.push("Strong signs that the document was digitally altered");
      flags.push({
        severity: "high",
        text: `Tamper evidence ${(tamperScore * 100).toFixed(0)}% (ELA ${(ela.score * 100).toFixed(0)}%, ${signs.length} visual sign(s), totals ${arithmetic})`,
      });
    }
    tam.score = 1 - tamperScore;
    tam.data = { phash, elaScore: ela.score, largestCluster: ela.largestCluster, tamperScore, nearest, contentDup };
    finish(tam);

    // 6 — Decision.
    const dec = begin("decision");
    const extractionQ = x ? (S("extract").score ?? 0.5) : 0.3;
    const integrity = 1 - tamperScore;
    let confidence = 0.15 * extractionQ + 0.35 * matchScore + 0.15 * amountScore + 0.1 * dateScore + 0.05 * nameScore + 0.2 * integrity;
    if (!x) confidence = Math.min(confidence, 0.6);
    confidence = clamp(confidence);

    const approveAt = rules.verification.autoApprove;
    // Custom vaults without a borrowed template are the strictest tier: a person always confirms.
    const strictest = template === "custom";
    // Automation only approves clean cases: any failed check sends it to a person.
    const anyFailedCheck = [S("extract"), S("classify"), S("tamper")].some((st) => st.checks.some((c) => c.status === "fail"));
    let decision: VerificationRow["decision"];
    const reasons: string[] = [];
    if (hardFails.length) {
      decision = "auto_denied";
      reasons.push(...hardFails);
    } else if (!x) {
      decision = "human_review";
      const why = S("extract").checks.find((c) => c.label === "Vision model")?.detail;
      reasons.push(`Automated reading wasn't possible${why ? ` (${why.slice(0, 100)})` : ""}, so a person will check this`, ...reviewReasons);
    } else if (confidence >= approveAt && tamperScore < 0.3 && amountScore >= 1 && !anyFailedCheck && !strictest) {
      decision = "auto_approved";
      reasons.push(`High confidence (${(confidence * 100).toFixed(0)}%) that this ${x.document_type.replace(/_/g, " ")} supports the withdrawal`);
    } else if (confidence <= rules.verification.autoDeny) {
      decision = "auto_denied";
      reasons.push(`Low confidence (${(confidence * 100).toFixed(0)}%) that the document supports this purpose`);
    } else {
      decision = "human_review";
      for (const s of [S("classify"), S("tamper"), S("extract")])
        for (const c of s.checks) if (c.status === "fail" || c.status === "warn") reasons.push(`${c.label}: ${c.detail}`);
      if (strictest) reasons.unshift("Custom vaults without a verification template are always confirmed by a person");
      if (!reasons.length) reasons.push(`Confidence ${(confidence * 100).toFixed(0)}% is between the auto-deny and auto-approve thresholds`);
    }

    dec.checks.push({
      label: "Confidence",
      status: decision === "auto_approved" ? "pass" : decision === "auto_denied" ? "fail" : "warn",
      detail: strictest
        ? `${(confidence * 100).toFixed(0)}% · custom vault — approval always by a person, deny ≤ ${(rules.verification.autoDeny * 100).toFixed(0)}%`
        : `${(confidence * 100).toFixed(0)}% · approve ≥ ${(approveAt * 100).toFixed(0)}%, deny ≤ ${(rules.verification.autoDeny * 100).toFixed(0)}%`,
    });
    dec.checks.push({
      label: "Route",
      status: "info",
      detail:
        decision === "auto_approved"
          ? "Approved automatically — funds released"
          : decision === "auto_denied"
            ? "Declined automatically — the user can appeal to a person"
            : `Queued for a human reviewer (SLA ${rules.verification.reviewSlaHours} business hours)`,
    });
    dec.score = confidence;
    dec.data = { weights: { extraction: 0.15, purpose: 0.35, amount: 0.15, date: 0.1, name: 0.05, integrity: 0.2 } };
    dec.status = decision === "auto_approved" ? "passed" : decision === "auto_denied" ? "failed" : "warning";
    finish(dec);

    tx(() => {
      const now = Date.now();
      run(
        `UPDATE verifications SET status = 'complete', confidence = ?, decision = ?, final_decision = ?, reasons = ?,
         queued_at = ?, decided_at = ?, duration_ms = ? WHERE proof_id = ?`,
        confidence,
        decision,
        decision === "auto_approved" ? "approved" : decision === "auto_denied" ? "denied" : null,
        JSON.stringify(reasons),
        decision === "human_review" ? now : null,
        decision === "human_review" ? null : now,
        now - t0,
        proof.id,
      );
      audit({
        userId: user.id,
        actor: PIPELINE_VERSION,
        actorType: "model",
        action: `verification.${decision}`,
        entityType: "proof",
        entityId: proof.id,
        details: {
          confidence: Number(confidence.toFixed(4)),
          reasons,
          model: `${PIPELINE_VERSION} · ${VISION_MODEL}`,
          tamperScore: Number(tamperScore.toFixed(3)),
        },
      });
      for (const f of flags) {
        raiseFlag({
          userId: user.id,
          source: "proof_verification",
          refId: proof.id,
          severity: f.severity,
          score: f.severity === "high" ? 85 : f.severity === "medium" ? 60 : 35,
          description: f.text,
        });
      }
      applyOutcome(
        user,
        proof,
        decision === "auto_approved" ? "approved" : decision === "auto_denied" ? "denied" : "review",
        PIPELINE_VERSION,
        "model",
      );
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[verify] pipeline", e);
    for (const s of stages) if (s.status === "running" || s.status === "pending") s.status = s.status === "running" ? "failed" : "skipped";
    run(
      "UPDATE verifications SET status = 'error', stages = ?, decision = 'human_review', queued_at = ?, reasons = ? WHERE proof_id = ?",
      JSON.stringify(stages),
      Date.now(),
      JSON.stringify(["Something went wrong while checking this document, so a person will review it"]),
      proof.id,
    );
    applyOutcome(user, proof, "review", PIPELINE_VERSION, "model");
    audit({
      userId: user.id,
      actor: PIPELINE_VERSION,
      actorType: "model",
      action: "verification.error",
      entityType: "proof",
      entityId: proof.id,
      details: { error: msg },
    });
  }
}

function applyOutcome(user: User, proof: ProofRow, outcome: "approved" | "denied" | "review", actor: string, actorType: "model" | "reviewer") {
  if (proof.withdrawal_id) {
    if (outcome === "approved") payoutWithdrawal(user, proof.withdrawal_id, actor, actorType);
    else if (outcome === "denied") run("UPDATE withdrawals SET status = 'denied', decided_at = ? WHERE id = ?", Date.now(), proof.withdrawal_id);
    else run("UPDATE withdrawals SET status = 'in_review' WHERE id = ?", proof.withdrawal_id);
  }
  if (proof.emergency_id) {
    const status = outcome === "approved" ? "verified" : outcome === "denied" ? "rejected" : "in_review";
    run("UPDATE emergency_requests SET receipt_status = ? WHERE id = ?", status, proof.emergency_id);
    if (outcome === "denied") {
      raiseFlag({
        userId: user.id,
        source: "emergency",
        refId: proof.emergency_id,
        severity: "medium",
        score: 65,
        description: "Post-hoc emergency receipt was rejected",
      });
    }
  }
}

export function reviewDecision(proofId: string, decision: "approved" | "denied", reviewer: string, note: string) {
  return tx(() => {
    const ver = get<VerificationRow>("SELECT * FROM verifications WHERE proof_id = ?", proofId);
    if (!ver) throw new HttpError(404, "Verification not found");
    const pending = (ver.decision === "human_review" && !ver.final_decision) || ver.final_decision === "appealed";
    if (!pending) throw new HttpError(409, "This verification is not awaiting review");
    const proof = get<ProofRow>("SELECT * FROM proofs WHERE id = ?", proofId)!;
    const user = get<User>("SELECT * FROM users WHERE id = ?", proof.user_id)!;
    run(
      "UPDATE verifications SET final_decision = ?, reviewer = ?, reviewer_note = ?, decided_at = ? WHERE proof_id = ?",
      decision,
      reviewer,
      note,
      Date.now(),
      proofId,
    );
    audit({
      userId: user.id,
      actor: reviewer,
      actorType: "reviewer",
      action: `verification.reviewed.${decision}`,
      entityType: "proof",
      entityId: proofId,
      details: { note, wasAppeal: ver.final_decision === "appealed", modelDecision: ver.decision, modelConfidence: ver.confidence },
    });
    applyOutcome(user, proof, decision, reviewer, "reviewer");
  });
}

export function appeal(user: User, proofId: string, note: string) {
  return tx(() => {
    const ver = get<VerificationRow>(
      "SELECT v.* FROM verifications v JOIN proofs p ON p.id = v.proof_id WHERE v.proof_id = ? AND p.user_id = ?",
      proofId,
      user.id,
    );
    if (!ver) throw new HttpError(404, "Verification not found");
    if (ver.final_decision !== "denied") throw new HttpError(409, "Only declined verifications can be appealed");
    run("UPDATE verifications SET final_decision = 'appealed', appeal_note = ?, queued_at = ? WHERE proof_id = ?", note, Date.now(), proofId);
    const proof = get<ProofRow>("SELECT * FROM proofs WHERE id = ?", proofId)!;
    if (proof.withdrawal_id) run("UPDATE withdrawals SET status = 'appealed' WHERE id = ?", proof.withdrawal_id);
    audit({
      userId: user.id,
      actor: user.id,
      actorType: "user",
      action: "verification.appealed",
      entityType: "proof",
      entityId: proofId,
      details: { note },
    });
  });
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
