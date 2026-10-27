/**
 * The proof pipeline, simulated: the same six stages as the server, timed, with an outcome the
 * sample file's name decides. A result lands whether or not anyone is watching (settleProofs).
 */
import proofFx from "@/data/fixtures/proof-view.json";
import detailFx from "@/data/fixtures/vault-detail.json";
import { billWord, covers, rulesCategory } from "../../categories";
import { ApiError } from "../errors";
import { DEMO_SAMPLES } from "../samples";
import type { EmergencyHistoryItem, ProofView, Stage, StageStatus, UploadFile, Vault, VaultDetail, WithdrawalRow } from "../types";
import { clone, currency, newId, recompute, record, S } from "./state";

type Outcome = "approved" | "purpose" | "edited" | "review";
interface DemoProof {
  id: string;
  createdAt: number;
  outcome: Outcome;
  vaultId: string | null;
  withdrawalId: string | null;
  emergencyId: string | null;
  amount: number;
  fileName: string | null;
  category: string;
  settled: boolean;
  queuedAt: number | null;
  /** A declined check the customer asked a person to look at again, with their note. */
  appealed: boolean;
  appealNote: string | null;
  /** Plain reason when the outcome depends on the vault (e.g. a bill for another purpose). */
  reason?: string;
  /** What the purpose check found, when it handed the bill to a person for a reason other than its age. */
  warnText?: string;
}
const proofs = new Map<string, DemoProof>();

const STAGES: { key: string; name: string; ms: number }[] = [
  { key: "intake", name: "Upload & integrity", ms: 450 },
  { key: "preprocess", name: "Pre-processing & forensics", ms: 700 },
  { key: "extract", name: "OCR & layout understanding", ms: 1200 },
  { key: "classify", name: "Purpose classification", ms: 600 },
  { key: "tamper", name: "Tamper & reuse detection", ms: 750 },
  { key: "decision", name: "Decision & audit trail", ms: 400 },
];
const PIPELINE_MS = STAGES.reduce((s, x) => s + x.ms, 0);

/**
 * Sample file names drive the demo outcome (the real server reads the document): edited files
 * fail the tamper check, a bill for another purpose fails the purpose check, an old bill goes to
 * a person, and anything else passes.
 */
function outcomeFor(fileName: string, vault?: Vault): { outcome: Outcome; reason?: string } {
  const f = fileName.toLowerCase();
  if (f.includes("tamper")) return { outcome: "edited" };
  const sample = DEMO_SAMPLES.find((x) => f.startsWith(x.key));
  if (f.includes("coffee") || sample?.category === "other") return { outcome: "purpose" };
  const rules = vault ? rulesCategory(vault) : null;
  // An Emergency vault takes any bill; a vault with its own rule is checked by a person below.
  if (sample && vault && rules && rules !== "custom" && rules !== "emergency" && !covers(vault, sample.category)) {
    return { outcome: "purpose", reason: `This is a ${billWord(sample.category)} bill, and this vault only covers ${billWord(rules)} costs.` };
  }
  if (f.includes("old")) return { outcome: "review" };
  // Same as the server: a custom vault with no borrowed template is the strictest tier.
  if (rules === "custom") return { outcome: "review", reason: "This vault follows its own rule, so a person checks every bill against it." };
  return { outcome: "approved" };
}

function stageStatus(outcome: Outcome, key: string): StageStatus {
  if (outcome === "edited" && key === "tamper") return "failed";
  if (outcome === "purpose" && key === "classify") return "failed";
  if (outcome === "review" && key === "classify") return "warning";
  if ((outcome === "edited" || outcome === "purpose") && key === "decision") return "failed";
  return "passed";
}

const CHECK_TEXT: Record<string, { pass: string; warn?: string; fail?: string }> = {
  intake: { pass: "File type and size are fine. No exact duplicate on file." },
  preprocess: { pass: "Straightened and cleaned. No editing software in the metadata." },
  extract: { pass: "Issuer, date, total and line items read clearly." },
  classify: {
    pass: "The document matches this vault's purpose.",
    warn: "The bill is older than this vault normally accepts, so a person will look at it.",
    fail: "This bill doesn't match what this vault is for.",
  },
  tamper: { pass: "No signs of editing. This document hasn't been used before.", fail: "The total looks edited: the line items don't add up to it." },
  decision: { pass: "Recorded in the audit trail.", fail: "Not approved. You can send a different bill or ask a person to check." },
};

const REASONS: Record<Outcome, string> = {
  approved: "Purpose, amount and date match. No signs of tampering.",
  purpose: "This bill doesn't match what this vault is for.",
  edited: "The total on this document looks edited — the line items don't add up to it.",
  review: "The bill is about ten months old, older than this vault normally accepts, so a person will check it.",
};

const declined = (p: DemoProof) => p.outcome === "edited" || p.outcome === "purpose";

function settleProof(p: DemoProof) {
  if (p.settled) return;
  p.settled = true;
  if (p.outcome === "review") p.queuedAt = Date.now();
  if (p.emergencyId) {
    const item = S.emergency.history.find((h) => h.id === p.emergencyId);
    if (item) item.receiptStatus = p.outcome === "approved" ? "verified" : p.outcome === "review" ? "in_review" : "rejected";
    return;
  }
  if (!p.vaultId || !p.withdrawalId) return;
  const v = S.vaults.find((x) => x.id === p.vaultId);
  const w = (S.withdrawals.get(p.vaultId) ?? []).find((x) => x.id === p.withdrawalId);
  if (!v || !w) return;
  w.decided_at = Date.now();
  if (p.outcome === "approved") {
    v.held = Math.max(0, v.held - p.amount);
    v.balance -= p.amount;
    S.totals.bank += p.amount;
    w.status = "paid";
    w.final_decision = "approved";
    w.decision = "auto_approved";
    recompute(v);
    record("withdrawal", `Verified withdrawal · ${w.payee ?? "Payee"}`, v, -p.amount, { account: "Linked bank account", kind: "bank" });
  } else if (p.outcome === "review") {
    // Still held while a person checks.
    w.status = "in_review";
    w.decision = "human_review";
  } else {
    // Declined: the hold is released once, here.
    v.held = Math.max(0, v.held - p.amount);
    w.status = "denied";
    w.final_decision = "denied";
    w.decision = "auto_denied";
    w.decision_reason = p.reason ?? REASONS[p.outcome];
    recompute(v);
  }
}

/**
 * The snapshot's own withdrawal proofs (the sample vault's earlier withdrawals), already decided.
 * Holding them here lets them be opened, resumed and appealed like this session's, with the same rules.
 */
function seedSnapshotProofs() {
  const detail = detailFx as unknown as VaultDetail;
  for (const w of detail.withdrawals) {
    if (!w.proof_id) continue;
    const outcome: Outcome = w.final_decision === "approved" ? "approved" : w.final_decision === "denied" ? "purpose" : "review";
    proofs.set(w.proof_id, {
      id: w.proof_id,
      createdAt: w.created_at,
      outcome,
      vaultId: w.vault_id,
      withdrawalId: w.id,
      emergencyId: null,
      amount: w.amount,
      fileName: null,
      category: detail.vault.template,
      settled: true,
      queuedAt: outcome === "review" ? w.created_at + PIPELINE_MS : null,
      appealed: false,
      appealNote: null,
      reason:
        w.decision_reason ??
        (outcome === "review" ? "Some items on this bill don't clearly match this vault's purpose, so a person will check it." : undefined),
      warnText: outcome === "review" ? "Some items don't clearly match this vault's purpose." : undefined,
    });
  }
}
seedSnapshotProofs();

/** Back to the snapshot's proofs only. */
export function resetProofs() {
  proofs.clear();
  seedSnapshotProofs();
}

/** Settles every proof whose checks are done (the server runs them in the background). */
export function settleProofs() {
  const now = Date.now();
  for (const p of proofs.values()) if (!p.settled && now - p.createdAt >= PIPELINE_MS) settleProof(p);
}

function proofView(p: DemoProof): ProofView {
  const elapsed = Date.now() - p.createdAt;
  let t = 0;
  const stages: Stage[] = STAGES.map((s) => {
    const start = t;
    t += s.ms;
    const status: StageStatus = elapsed >= t ? stageStatus(p.outcome, s.key) : elapsed >= start ? "running" : "pending";
    const text = CHECK_TEXT[s.key];
    const detailText = status === "failed" ? text.fail : status === "warning" ? (p.warnText ?? text.warn) : text.pass;
    return {
      key: s.key,
      name: s.name,
      status,
      startedAt: elapsed >= start ? p.createdAt + start : undefined,
      finishedAt: elapsed >= t ? p.createdAt + t : undefined,
      checks:
        status === "pending" || status === "running"
          ? []
          : [{ label: s.name, status: status === "failed" ? "fail" : status === "warning" ? "warn" : "pass", detail: detailText ?? text.pass }],
    };
  });
  const done = elapsed >= PIPELINE_MS;
  if (done) settleProof(p);
  const isDeclined = declined(p);
  // An appealed decline is back with a person, as on the server (final decision "appealed").
  const finalDecision = p.appealed ? "appealed" : p.outcome === "approved" ? "approved" : isDeclined ? "denied" : null;
  const decision = p.outcome === "approved" ? "auto_approved" : isDeclined ? "auto_denied" : "human_review";
  const w = p.vaultId ? (S.withdrawals.get(p.vaultId) ?? []).find((x) => x.id === p.withdrawalId) : null;
  const v = p.vaultId ? S.vaults.find((x) => x.id === p.vaultId) : null;
  return {
    id: p.id,
    purpose: p.emergencyId ? "emergency_receipt" : "withdrawal",
    category: p.category,
    fileName: p.fileName,
    createdAt: p.createdAt,
    hasEla: true,
    extracted: done ? { issuer: w?.payee ?? "City General Hospital", total_amount: p.amount / 100, currency, summary: "Itemised invoice" } : null,
    vault: v ? { id: v.id, name: v.name, category: v.category } : null,
    withdrawal: w ? { id: w.id, amount: w.amount, payee: w.payee, status: w.status } : null,
    emergencyId: p.emergencyId,
    verification: {
      status: done ? "complete" : "running",
      stages,
      confidence: done ? (p.outcome === "approved" ? 0.93 : isDeclined ? 0.21 : 0.62) : null,
      decision: done ? decision : null,
      finalDecision: done ? finalDecision : null,
      reasons: done ? [p.reason ?? REASONS[p.outcome]] : [],
      modelVersion: "vw-proof@1.4 · demo simulator",
      reviewer: null,
      reviewerNote: null,
      appealNote: p.appealNote,
      queuedAt: done ? p.queuedAt : null,
      decidedAt: done && p.outcome !== "review" && !p.appealed ? p.createdAt + PIPELINE_MS : null,
      durationMs: done ? PIPELINE_MS : null,
    },
  };
}

/**
 * A proof by id: one this simulator holds, or the snapshot's own emergency receipt, which it can
 * show but not re-run (marked `practiceSnapshot`).
 */
export function proofById(proofId: string): ProofView {
  const p = proofs.get(proofId);
  if (p) return proofView(p);
  const snapshot = proofFx as unknown as ProofView;
  if (snapshot.id === proofId) return { ...clone(snapshot), practiceSnapshot: true };
  throw new ApiError("Proof not found", 404);
}

/** Starts the checks on a withdrawal's bill. */
export function submitWithdrawalProof(vault: Vault, w: WithdrawalRow, file: UploadFile) {
  const pid = newId("prf");
  const result = outcomeFor(file.name, vault);
  proofs.set(pid, {
    id: pid,
    createdAt: Date.now(),
    outcome: result.outcome,
    reason: result.reason,
    vaultId: vault.id,
    withdrawalId: w.id,
    emergencyId: null,
    amount: w.amount,
    fileName: file.name,
    category: vault.template,
    settled: false,
    queuedAt: null,
    appealed: false,
    appealNote: null,
  });
  // The server's status while the bill is checked; the upload itself answers "processing".
  w.status = "verifying";
  w.proof_id = pid;
  return { id: pid, status: "processing" };
}

/** Starts the checks on an emergency request's receipt. */
export function submitReceiptProof(item: EmergencyHistoryItem, file: UploadFile) {
  const pid = newId("prf");
  proofs.set(pid, {
    id: pid,
    createdAt: Date.now(),
    outcome: outcomeFor(file.name).outcome,
    vaultId: null,
    withdrawalId: null,
    emergencyId: item.id,
    amount: item.amount,
    fileName: file.name,
    category: "emergency",
    settled: false,
    queuedAt: null,
    appealed: false,
    appealNote: null,
  });
  // The server's status while a receipt is checked.
  item.receiptStatus = "submitted";
  item.receiptProofId = pid;
  return { id: pid, status: "processing" };
}

/** Same rules as the server: only a declined check can go to a person, once, and the money is held again meanwhile. */
export function appealProof(proofId: string, note: string) {
  const p = proofs.get(proofId);
  if (!p) throw new ApiError("Verification not found", 404);
  if (!p.settled || !declined(p) || p.appealed) throw new ApiError("Only declined verifications can be appealed", 409);
  const text = note.trim();
  if (text.length < 5) throw new ApiError("Add a few more words for the person checking it", 400);
  p.appealed = true;
  p.appealNote = text.slice(0, 500);
  p.queuedAt = Date.now();
  if (p.withdrawalId && p.vaultId) {
    const v = S.vaults.find((x) => x.id === p.vaultId);
    const w = (S.withdrawals.get(p.vaultId) ?? []).find((x) => x.id === p.withdrawalId);
    if (v && w && w.status === "denied") {
      w.status = "appealed";
      w.final_decision = "appealed";
      w.decided_at = null;
      v.held += w.amount;
      recompute(v);
    }
  }
}
