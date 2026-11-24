import fs from "node:fs";
import { all, parseJson, run } from "../../db";
import { dHash, EDITING_SOFTWARE, ELA_MAX_PIXELS, errorLevelAnalysis, hamming, type ExifSummary } from "../forensics";
import type { Extraction } from "../types";
import type { PipelineContext } from "./context";
import type { Arithmetic } from "./rules";

/** Normalised content fingerprints used to spot the same document being reused. */
export function contentKeys(x: Partial<Extraction>) {
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

/**
 * Combined tamper evidence, 0..1: independent signals multiplied as "chance it is clean".
 * ela: ELA score · exifScore: metadataScore() · signs: visual edit signs the model saw.
 */
export function tamperScoreOf(s: { ela: number; exifScore: number; signs: number; arithmetic: Arithmetic }) {
  const arithScore = s.arithmetic === "mismatch" ? 0.6 : s.arithmetic === "minor" ? 0.15 : 0;
  return 1 - (1 - s.ela * 0.85) * (1 - s.exifScore) * (1 - Math.min(1, s.signs * 0.3)) * (1 - arithScore);
}

/** Metadata evidence: a capture time over a week before the printed date (0.7) and editing software (0.5), combined. */
export function metadataScore(s: { software: boolean; timestampGap: boolean }) {
  return 1 - (1 - (s.timestampGap ? 0.7 : 0)) * (1 - (s.software ? 0.5 : 0));
}

/** At or above this tamper score a bill is declined, if the evidence is corroborated (see assessTamper). */
export const TAMPER_DECLINE_AT = 0.8;

export interface TamperSignals {
  /** ELA score; 0 when ELA was skipped (too large) or inconclusive. */
  ela: number;
  /** EXIF Software names an editing app. */
  software: boolean;
  /** The photo was captured more than 7 days before the bill's own date. */
  timestampGap: boolean;
  /** Visual edit signs the vision model reported. */
  signs: number;
  arithmetic: Arithmetic;
  /** Near-identical (dHash) to an earlier proof whose content differs: possibly an edited copy of it. */
  perceptualReuse: boolean;
}
export interface TamperAssessment {
  score: number;
  /** The same score with ELA left out, for the low-confidence rule. */
  scoreWithoutEla: number;
  /** The signals other than ELA that point to editing. */
  corroborating: string[];
  /** ELA is the only evidence: it may send the bill to a person, never decline it. */
  elaOnly: boolean;
  /** Decline: score ≥ TAMPER_DECLINE_AT and not on ELA alone. */
  decline: boolean;
}

/**
 * Weighs the tamper signals. ELA can't decline on its own (it flags letterhead bars, stamps and page edges on genuine
 * photos too): a decline needs a corroborating signal (metadata, totals that don't add up, model edit signs, or a
 * near-identical earlier proof). Editing software and a capture-date gap together reach the decline line by themselves.
 */
export function assessTamper(s: TamperSignals): TamperAssessment {
  const exifScore = metadataScore(s);
  const score = tamperScoreOf({ ela: s.ela, exifScore, signs: s.signs, arithmetic: s.arithmetic });
  const scoreWithoutEla = tamperScoreOf({ ela: 0, exifScore, signs: s.signs, arithmetic: s.arithmetic });
  const corroborating = [
    s.software && "editing software in the metadata",
    s.timestampGap && "photo captured before the bill's date",
    s.arithmetic === "mismatch" && "totals don't add up",
    s.signs > 0 && "edit signs seen by the vision model",
    s.perceptualReuse && "near-identical to an earlier proof with different content",
  ].filter((c): c is string => !!c);
  const elaOnly = s.ela > 0 && corroborating.length === 0;
  return { score, scoreWithoutEla, corroborating, elaOnly, decline: score >= TAMPER_DECLINE_AT && !elaOnly };
}

/** Stage 5 — Tamper & reuse detection: ELA, reuse of the same document, capture time, visual edit signs, arithmetic. */
export async function runTamper(ctx: PipelineContext, x: Extraction | null, exif: ExifSummary, arithmetic: Arithmetic): Promise<TamperAssessment> {
  const { proof } = ctx;
  const tam = ctx.begin("tamper");
  const elaResult = await errorLevelAnalysis(ctx.buffer);
  // Very large photos skip ELA (memory-bound); reuse, metadata, arithmetic and visual checks still apply.
  const ela = elaResult ?? { score: 0, largestCluster: 0, texturedBlocks: 0, heatmap: null, inconclusive: false };
  // An image that re-compresses unchanged gives ELA nothing to measure: no evidence either way.
  const elaEvidence = elaResult && !elaResult.inconclusive ? elaResult.score : 0;
  const elaPath = elaResult ? proof.stored_path.replace(/\.[a-z]+$/, "_ela.png") : null;
  if (elaResult && elaPath) fs.writeFileSync(elaPath, elaResult.heatmap);
  const phash = await dHash(ctx.buffer);
  run("UPDATE proofs SET phash = ?, ela_path = ? WHERE id = ?", phash, elaPath, proof.id);
  tam.checks.push(
    !elaResult
      ? {
          label: "Error level analysis",
          status: "info",
          detail: `Skipped — the photo is above the ${ELA_MAX_PIXELS / 1_000_000} MP analysis limit; other tamper checks still applied`,
        }
      : elaResult.inconclusive
        ? {
            label: "Error level analysis",
            status: "info",
            detail: "Inconclusive — the image re-compresses almost unchanged (it was likely saved at about JPEG quality 75), so compression differences can't be measured; other tamper checks still applied",
          }
        : {
            label: "Error level analysis",
            status: ela.score >= 0.5 ? "fail" : ela.score >= 0.2 ? "warn" : "pass",
            detail: `Anomaly ${(ela.score * 100).toFixed(0)}% · largest inconsistent region ${ela.largestCluster} blocks of ${ela.texturedBlocks}`,
          },
  );
  if (elaEvidence >= 0.5)
    ctx.flags.push({ severity: "medium", text: `ELA found a localised compression inconsistency (${(elaEvidence * 100).toFixed(0)}%)` });

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
  // Read, not reused, but visually near-identical to an earlier proof: an edited copy, or a recurring bill from the
  // same template (monthly rent). Only counts as corroboration for other tamper evidence.
  const perceptualReuse = !!x && !contentDup && !!nearest && nearest.d <= 10;
  if (contentDup) {
    tam.checks.push({
      label: "Document reuse",
      status: "fail",
      detail: `Same issuer and reference/amount/date as proof ${contentDup.id}${contentDup.cross ? " from another account" : ""}`,
    });
    ctx.hardFails.push({ reason: "This document was already used to justify another withdrawal", forensic: false });
    ctx.flags.push({ severity: "high", text: `Document content reused from proof ${contentDup.id}${contentDup.cross ? " (cross-account)" : ""}` });
  } else if (nearest && nearest.d <= 10 && !x) {
    tam.checks.push({
      label: "Document reuse",
      status: "fail",
      detail: `Visually near-identical to proof ${nearest.id} (${nearest.d}/256 bits) and content unreadable`,
    });
    ctx.reviewReasons.push("Looks like a previously submitted document");
  } else if (perceptualReuse && nearest) {
    tam.checks.push({
      label: "Document reuse",
      status: "warn",
      detail: `Visually near-identical to proof ${nearest.id} (${nearest.d}/256 bits) but with different content — an edited copy, or a recurring bill`,
    });
  } else {
    tam.checks.push({
      label: "Document reuse",
      status: "pass",
      detail: nearest && nearest.d <= 24 ? `Same layout as proof ${nearest.id}, but different content` : "No matching prior documents",
    });
  }

  let timestampGap = false;
  if (x?.document_date && exif.dateTimeOriginal) {
    const lagDays = (new Date(x.document_date).getTime() - new Date(exif.dateTimeOriginal).getTime()) / 86_400_000;
    if (lagDays > 7) {
      timestampGap = true;
      tam.checks.push({
        label: "Timestamp consistency",
        status: "fail",
        detail: `Photo captured ${Math.round(lagDays)} days before the document's own date`,
      });
      ctx.flags.push({ severity: "medium", text: "Capture timestamp predates the document date" });
    } else {
      tam.checks.push({ label: "Timestamp consistency", status: "pass", detail: "Capture time is consistent with the document date" });
    }
  }
  const software = !!(exif.software && EDITING_SOFTWARE.test(exif.software));

  const signs = x?.editing_signs ?? [];
  tam.checks.push({
    label: "Visual edit signs",
    status: signs.length >= 2 ? "fail" : signs.length === 1 ? "warn" : "pass",
    detail: signs.length ? signs.slice(0, 3).join("; ") : x ? "None noticed by the vision model" : "Not assessed",
  });
  const assessment = assessTamper({ ela: elaEvidence, software, timestampGap, signs: signs.length, arithmetic, perceptualReuse });
  const { score: tamperScore } = assessment;
  if (assessment.decline) {
    ctx.hardFails.push({ reason: "Strong signs that the document was digitally altered", forensic: true });
    ctx.flags.push({
      severity: "high",
      text: `Tamper evidence ${(tamperScore * 100).toFixed(0)}% (ELA ${(elaEvidence * 100).toFixed(0)}%, ${signs.length} visual sign(s), totals ${arithmetic}${assessment.corroborating.length ? `; ${assessment.corroborating.join(", ")}` : ""})`,
    });
  } else if (tamperScore >= TAMPER_DECLINE_AT && assessment.elaOnly) {
    tam.checks.push({
      label: "Tamper evidence",
      status: "warn",
      detail: `Error level analysis alone (${(elaEvidence * 100).toFixed(0)}%) with nothing to corroborate it, so a person decides`,
    });
  }
  tam.score = 1 - tamperScore;
  tam.data = {
    phash,
    elaScore: ela.score,
    elaInconclusive: ela.inconclusive,
    largestCluster: ela.largestCluster,
    tamperScore,
    corroborating: assessment.corroborating,
    elaOnly: assessment.elaOnly,
    nearest,
    contentDup,
  };
  ctx.finish(tam);
  return assessment;
}
