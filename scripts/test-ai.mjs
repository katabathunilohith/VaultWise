// npm run test:ai: checks the AI bill reader against Groq for real, using GROQ_API_KEY from .env.local.
// Runs tests/ai-verification.test.ts with GROQ_LIVE_KEY set, then prints how each sample bill was decided.
// The normal `npm test` never calls Groq.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
const key = (process.env.GROQ_LIVE_KEY || process.env.GROQ_API_KEY || "").trim();
if (!key) {
  console.error("No Groq key found. Put it in .env.local as GROQ_API_KEY=... (get one at https://console.groq.com/keys).");
  process.exit(1);
}

const report = path.join(os.tmpdir(), "vaultwise-ai-check.txt");
fs.rmSync(report, { force: true });
console.log("Sending the 7 sample bills to Groq. This takes about 3 minutes...");

const run = spawnSync("npx", ["vitest", "run", "tests/ai-verification.test.ts"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, GROQ_LIVE_KEY: key, AI_CHECK_REPORT: report },
});

if (fs.existsSync(report)) {
  console.log("\nHow each sample bill was decided (bill, vault, decision, confidence, reason):\n");
  console.log(fs.readFileSync(report, "utf8"));
}
console.log(run.status === 0 ? "The AI is working." : "The AI check failed. See the lines above.");
process.exit(run.status ?? 1);
