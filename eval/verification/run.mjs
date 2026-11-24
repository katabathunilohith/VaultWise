// npm run eval:verification                  offline: oracle reader + no-AI, no network (CI-safe)
// npm run eval:verification -- --live        one pass through the real Groq vision model (GROQ_API_KEY in .env.local)
//
// Options: --delay-ms <n> pause between live calls (default 8000) · --no-generate reuse eval/verification/out/dataset
//          --limit <n> only the first n bills (a smoke run; results are still written)
//          --report-only re-render docs/evaluation/verification-results.md from the stored JSON (runs nothing).
// Generates the dataset (generate.mjs), runs the real pipeline over it in a throwaway database once per configuration
// (evaluate.eval.ts, through vitest so the app's TypeScript and "@/..." imports load as in the tests), then writes
// docs/evaluation/verification-results.{md,json} (report.mjs).
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DATASET_DIR, generate } from "./generate.mjs";
import { headlineRows, renderMarkdown, updateResults } from "./report.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const OUT = path.join(HERE, "out");
const DOCS = path.join(ROOT, "docs", "evaluation");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const live = args.includes("--live");
const delayMs = Number(opt("--delay-ms", 8000));
const limit = Number(opt("--limit", 0));

function gitCommit() {
  try {
    const sha = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim().length > 0;
    return dirty ? `${sha}+uncommitted` : sha;
  } catch {
    return "unknown";
  }
}

const env = { ...process.env, EVAL_DATASET: DEFAULT_DATASET_DIR, EVAL_LIMIT: String(limit) };
delete env.GROQ_API_KEY; // the evaluation sets it itself, and only for the live configuration
if (live) {
  if (fs.existsSync(path.join(ROOT, ".env.local"))) process.loadEnvFile(path.join(ROOT, ".env.local"));
  const key = (process.env.GROQ_API_KEY || "").trim();
  if (!key) {
    console.error("Live mode needs GROQ_API_KEY in .env.local (get one at https://console.groq.com/keys).");
    process.exit(1);
  }
  env.GROQ_LIVE_KEY = key;
  for (const k of ["GROQ_VISION_MODEL", "GROQ_TEXT_MODEL"]) if (process.env[k]) env[k] = process.env[k];
  env.EVAL_DELAY_MS = String(delayMs);
}

if (args.includes("--report-only")) {
  // Re-render the page from the stored results (after changing report.mjs); runs nothing, calls nothing.
  const store = JSON.parse(fs.readFileSync(path.join(DOCS, "verification-results.json"), "utf8"));
  fs.writeFileSync(path.join(DOCS, "verification-results.md"), renderMarkdown(store));
  console.log(headlineRows(store).lines.join("\n"));
  console.log("\nRe-rendered docs/evaluation/verification-results.md.");
  process.exit(0);
}

const t0 = Date.now();
if (args.includes("--no-generate") && fs.existsSync(path.join(DEFAULT_DATASET_DIR, "manifest.json"))) {
  console.log(`Reusing the dataset in ${path.relative(ROOT, DEFAULT_DATASET_DIR)}`);
} else {
  const manifest = await generate({ outDir: DEFAULT_DATASET_DIR });
  console.log(`Generated ${manifest.items.length} bills for ${manifest.today} (${Object.entries(manifest.counts).map(([k, v]) => `${v} ${k}`).join(", ")})`);
}

const configs = live ? ["live"] : ["stub", "no-ai"];
const raws = [];
for (const config of configs) {
  const rawPath = path.join(OUT, `raw-${config}.json`);
  fs.rmSync(rawPath, { force: true });
  console.log(`\n== ${config}${config === "live" ? ` (one pass, ${delayMs / 1000}s between bills)` : ""} ==`);
  const run = spawnSync("npx vitest run --config eval/verification/vitest.config.mts", {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: { ...env, EVAL_CONFIG: config, EVAL_RAW_OUT: rawPath },
  });
  if (run.status !== 0 || !fs.existsSync(rawPath)) {
    console.error(`The ${config} evaluation failed (exit ${run.status}). Nothing was written to docs/evaluation.`);
    process.exit(run.status || 1);
  }
  raws.push(JSON.parse(fs.readFileSync(rawPath, "utf8")));
}

const store = updateResults({ docsDir: DOCS, mode: live ? "live" : "offline", raws, commit: gitCommit(), runAt: new Date().toISOString() });
console.log(`\n${headlineRows(store).lines.join("\n")}\n`);
console.log(`Wrote docs/evaluation/verification-results.md and .json in ${((Date.now() - t0) / 1000).toFixed(0)}s.`);
