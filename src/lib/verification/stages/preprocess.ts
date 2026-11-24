import { run } from "../../db";
import { EDITING_SOFTWARE, preprocess, readExif, type ExifSummary } from "../forensics";
import type { PipelineContext } from "./context";

export type Processed = Awaited<ReturnType<typeof preprocess>>;

/** Stage 2 — Pre-processing & forensics: the image the model reads, plus EXIF metadata checks. */
export async function runPreprocess(ctx: PipelineContext): Promise<{ processed: Processed; exif: ExifSummary }> {
  const pre = ctx.begin("preprocess");
  const processed = await preprocess(ctx.buffer);
  const exif: ExifSummary = await readExif(ctx.buffer);
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
      ctx.flags.push({ severity: "medium", text: `Proof saved by editing software (${exif.software})` });
    }
    if (exif.dateTimeOriginal && exif.modifyDate) {
      const gapH = (new Date(exif.modifyDate).getTime() - new Date(exif.dateTimeOriginal).getTime()) / 3_600_000;
      if (gapH > 24)
        pre.checks.push({ label: "Modified after capture", status: "warn", detail: `File modified ${gapH.toFixed(0)}h after it was captured` });
    }
  }
  pre.data = { exif, original: processed.original };
  pre.score = pre.checks.some((c) => c.status === "warn") ? 0.6 : 1;
  run("UPDATE proofs SET exif = ? WHERE id = ?", JSON.stringify(exif), ctx.proof.id);
  ctx.finish(pre);
  return { processed, exif };
}
