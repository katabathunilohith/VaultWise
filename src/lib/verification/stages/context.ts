import fs from "node:fs";
import { get, parseJson } from "../../db";
import { rulesFor } from "../../compliance";
import type { VaultCategory } from "../../shared";
import type { User } from "../../users";
import { saveStages } from "../persistence";
import type { ProofRow, Stage, VerificationRow } from "../types";

export const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

export interface Flag {
  severity: "low" | "medium" | "high";
  text: string;
}

/**
 * A reason to decline automatically. `forensic` ones come from image evidence of editing (the tamper score); they
 * never decline a customer who asked for a person to read the bill, who goes to review instead. The others
 * (exact duplicate, reused content, wrong purpose, future date, not a document) decline everyone.
 */
export interface HardFail {
  reason: string;
  forensic: boolean;
}

/** Everything one run of the pipeline reads and adds to, passed from stage to stage. */
export interface PipelineContext {
  proof: ProofRow;
  user: User;
  rules: ReturnType<typeof rulesFor>;
  vault?: { id: string; name: string; template: VaultCategory };
  /** The vault's verification template (a non-custom vault's template is its category). */
  template: VaultCategory;
  vaultName: string;
  /** The amount asked for, in minor units, or null when there is none to compare. */
  requested: number | null;
  buffer: Buffer;
  stages: Stage[];
  /** Each entry declines automatically (decision stage, rule 1), forensic ones only with the customer's AI consent. */
  hardFails: HardFail[];
  /** Added to the reasons when the bill goes to a person because it couldn't be read. */
  reviewReasons: string[];
  /** Raised as fraud flags when the outcome is recorded. */
  flags: Flag[];
  startedAt: number;
  stage(key: string): Stage;
  /** Marks a stage running and saves, so clients watching the proof see it start. */
  begin(key: string): Stage;
  /** Settles a still-running stage from its checks (any fail → failed, any warn → warning) and saves. */
  finish(stage: Stage): void;
}

/** Loads the proof and everything the stages need. Undefined if the proof doesn't exist. */
export function loadContext(proofId: string, startedAt: number): PipelineContext | undefined {
  const proof = get<ProofRow>("SELECT * FROM proofs WHERE id = ?", proofId);
  if (!proof) return undefined;
  const user = get<User>("SELECT * FROM users WHERE id = ?", proof.user_id)!;
  const rules = rulesFor(user.jurisdiction);
  const vault = proof.vault_id
    ? get<{ id: string; name: string; template: VaultCategory }>("SELECT id, name, template FROM vaults WHERE id = ?", proof.vault_id)
    : undefined;
  const withdrawal = proof.withdrawal_id
    ? get<{ amount: number; payee: string }>("SELECT amount, payee FROM withdrawals WHERE id = ?", proof.withdrawal_id)
    : undefined;
  const emergency = proof.emergency_id
    ? get<{ amount: number }>("SELECT amount FROM emergency_requests WHERE id = ?", proof.emergency_id)
    : undefined;

  const ver = get<VerificationRow>("SELECT * FROM verifications WHERE proof_id = ?", proofId)!;
  const stages = parseJson<Stage[]>(ver.stages, []);
  const stage = (key: string) => stages.find((s) => s.key === key)!;
  return {
    proof,
    user,
    rules,
    vault,
    template: vault?.template ?? proof.category,
    vaultName: vault?.name ?? "Emergency",
    requested: withdrawal?.amount ?? emergency?.amount ?? null,
    buffer: fs.readFileSync(proof.stored_path),
    stages,
    hardFails: [],
    reviewReasons: [],
    flags: [],
    startedAt,
    stage,
    begin(key) {
      const s = stage(key);
      s.status = "running";
      s.startedAt = Date.now();
      saveStages(proofId, stages);
      return s;
    },
    finish(s) {
      s.finishedAt = Date.now();
      if (s.status === "running") {
        s.status = s.checks.some((c) => c.status === "fail") ? "failed" : s.checks.some((c) => c.status === "warn") ? "warning" : "passed";
      }
      saveStages(proofId, stages);
    },
  };
}
