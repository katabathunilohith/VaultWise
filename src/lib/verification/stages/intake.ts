import { get } from "../../db";
import type { PipelineContext } from "./context";

/** Stage 1 — Upload & integrity: file type and size, and an exact duplicate (same SHA-256) from any account. */
export function runIntake(ctx: PipelineContext) {
  const { proof } = ctx;
  const intake = ctx.begin("intake");
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
    ctx.hardFails.push({ reason: "This exact file was already used as proof", forensic: false });
    ctx.flags.push({ severity: "high", text: `Exact duplicate of proof ${exactDup.id}${cross ? " (cross-account)" : ""}` });
  } else {
    intake.checks.push({ label: "Exact duplicate", status: "pass", detail: "SHA-256 not seen before" });
  }
  intake.data = { sha256: proof.sha256 };
  intake.score = exactDup ? 0 : 1;
  ctx.finish(intake);
}
