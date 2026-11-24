import type { VaultCategory } from "../shared";

/** 1.5 (2026-11-24): ELA alone never declines, inconclusive ELA ignored, metadata signals combined, consent-aware hard fails. */
export const PIPELINE_VERSION = "vw-proof@1.5";

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

/** The six stages in order, as stored in verifications.stages and shown to clients. */
export const STAGE_DEFS: [string, string][] = [
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
  /** 0 when the person said no to the AI reading it: a person reads it instead. */
  ai_allowed: number;
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
