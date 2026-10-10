import proofFx from "@/data/fixtures/proof-view.json";
import detailFx from "@/data/fixtures/vault-detail.json";
import type { ProofView, Stage, StageStatus, VaultDetail, WithdrawalRow } from "@/lib/api/types";

/**
 * Practice history. The demo simulator holds this session's proofs and the sample vault's earlier
 * ones, but not the snapshot's emergency receipt. Rebuilding snapshot proofs from the fixtures
 * keeps every link in Practice mode working (the withdrawal ones are a fallback).
 */

const detail = detailFx as unknown as VaultDetail;

const STAGES: { key: string; name: string }[] = [
  { key: "intake", name: "Upload & integrity" },
  { key: "preprocess", name: "Pre-processing & forensics" },
  { key: "extract", name: "OCR & layout understanding" },
  { key: "classify", name: "Purpose classification" },
  { key: "tamper", name: "Tamper & reuse detection" },
  { key: "decision", name: "Decision & audit trail" },
];

const PLAIN: Record<string, string> = {
  intake: "The file type and size are fine, and it hasn't been sent before.",
  preprocess: "Straightened and cleaned up. No sign it went through an editing app.",
  extract: "Issuer, date, total and line items read clearly.",
  classify: "It matches what this vault is for.",
  tamper: "No signs of editing, and not used for an earlier payout.",
  decision: "Decided.",
};

function fromWithdrawal(row: WithdrawalRow): ProofView {
  const outcome = row.final_decision === "approved" ? "approved" : row.final_decision === "denied" ? "denied" : "review";
  const status = (key: string): StageStatus => {
    if (key !== "classify") return "passed";
    return outcome === "denied" ? "failed" : outcome === "review" ? "warning" : "passed";
  };
  const start = row.created_at;
  const stages: Stage[] = STAGES.map((s, i) => {
    const st = status(s.key);
    const detailText =
      s.key === "classify" && st === "failed"
        ? "It doesn't match what this vault is for."
        : s.key === "classify" && st === "warning"
          ? "Some items don't clearly match this vault's purpose."
          : PLAIN[s.key];
    return {
      key: s.key,
      name: s.name,
      status: st,
      startedAt: start + i * 600,
      finishedAt: start + (i + 1) * 600,
      checks: [{ label: s.name, status: st === "failed" ? "fail" : st === "warning" ? "warn" : "pass", detail: detailText }],
    };
  });
  return {
    id: row.proof_id ?? row.id,
    purpose: "withdrawal",
    category: detail.vault.template,
    fileName: null,
    createdAt: start,
    hasEla: true,
    extracted: { issuer: row.payee, total_amount: row.amount / 100, currency: detail.currency, document_date: null, summary: "Itemised bill" },
    vault: { id: detail.vault.id, name: detail.vault.name, category: detail.vault.category },
    withdrawal: { id: row.id, amount: row.amount, payee: row.payee, status: row.status },
    emergencyId: null,
    verification: {
      status: "complete",
      stages,
      confidence: null,
      decision: row.decision,
      finalDecision: row.final_decision,
      reasons: [],
      modelVersion: null,
      reviewer: null,
      reviewerNote: null,
      appealNote: null,
      queuedAt: outcome === "review" ? start + STAGES.length * 600 : null,
      decidedAt: row.decided_at,
      durationMs: STAGES.length * 600,
    },
  };
}

/** A proof from the Practice snapshot, or null if the id isn't one of them. */
export function practiceHistoryProof(id: string): ProofView | null {
  const fx = proofFx as unknown as ProofView;
  if (fx.id === id) return fx;
  const row = detail.withdrawals.find((w) => w.proof_id === id);
  return row ? fromWithdrawal(row) : null;
}
