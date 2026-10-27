import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { get } from "@/lib/db";
import { transfer, userAccount, worldAccount } from "@/lib/ledger";
import { createUser, type User } from "@/lib/users";
import { createVault, createWithdrawal, deposit } from "@/lib/vaults";
import { createProof, runPipeline } from "@/lib/verification/pipeline";
import type { VaultCategory } from "@/lib/shared";

/**
 * Checks the proof-of-purpose verifier end to end on the app's seven sample bills.
 *
 * Always: with no AI key, every bill goes to a person (nothing is approved blind).
 * With a key: `npm run test:ai` (reads GROQ_API_KEY from .env.local and prints a table of results).
 * (tests/setup.ts removes GROQ_API_KEY so the normal suite never calls the provider.)
 */

const SAMPLES = path.join(process.cwd(), "mobile", "assets", "samples");
const LIVE_KEY = process.env.GROQ_LIVE_KEY;

const created = createUser({ name: "Priya Sharma", country: "IN", pin: "2468" });
const fresh = () => get<User>("SELECT * FROM users WHERE id = ?", created.id)!;
transfer({
  userId: created.id,
  from: worldAccount(created.currency).id,
  to: userAccount(created.id, "bank", created.currency).id,
  amount: 50_00_000_00,
  kind: "income",
  memo: "seed",
});

const vaults: Record<string, string> = {};
function vaultFor(category: VaultCategory) {
  if (!vaults[category]) {
    vaults[category] = createVault(fresh(), { name: `${category} fund`, category, target: 10_00_000_00 });
    deposit(fresh(), vaults[category], 5_00_000_00);
  }
  return vaults[category];
}

async function check(sample: string, category: VaultCategory, amount = 2_000_00) {
  const vaultId = vaultFor(category);
  const withdrawalId = createWithdrawal(fresh(), vaultId, amount, "Sample payee");
  const buffer = fs.readFileSync(path.join(SAMPLES, `${sample}.jpg`));
  const proofId = createProof(fresh(), {
    buffer,
    fileName: `${sample}.jpg`,
    mime: "image/jpeg",
    purpose: "withdrawal",
    category,
    vaultId,
    withdrawalId,
  });
  await runPipeline(proofId);
  const v = get<{ status: string; decision: string; final_decision: string | null; confidence: number | null; reasons: string; stages: string }>(
    "SELECT status, decision, final_decision, confidence, reasons, stages FROM verifications WHERE proof_id = ?",
    proofId,
  )!;
  const stages = JSON.parse(v.stages) as { key: string; status: string; summary?: string; checks?: { label: string; status: string; detail: string }[] }[];
  return { ...v, reasons: JSON.parse(v.reasons ?? "[]") as string[], stages };
}

// Skipped in the live run: its rent receipt would make the live one an exact duplicate, judged as reuse instead of read.
describe.skipIf(!!LIVE_KEY)("AI verification without a key", () => {
  it("sends every bill to a person and says the vision model is unavailable", async () => {
    delete process.env.GROQ_API_KEY;
    const r = await check("rent-receipt", "housing");
    expect(r.status).toBe("complete");
    expect(r.decision).toBe("human_review");
    expect(r.final_decision).toBeNull();
    const extract = r.stages.find((s) => s.key === "extract");
    expect(extract?.status).toBe("skipped");
  });
});

describe.skipIf(!LIVE_KEY)("AI verification with the live vision model", () => {
  const cases: { sample: string; category: VaultCategory; expect: "approve" | "not-approve" | "any" }[] = [
    { sample: "medical-invoice", category: "health", expect: "any" },
    { sample: "pharmacy-receipt", category: "health", expect: "any" },
    { sample: "tuition-invoice", category: "education", expect: "any" },
    { sample: "rent-receipt", category: "housing", expect: "any" },
    { sample: "coffee-receipt", category: "health", expect: "not-approve" },
    { sample: "old-invoice", category: "health", expect: "not-approve" },
    { sample: "tampered-invoice", category: "health", expect: "not-approve" },
  ];

  it(
    "reads each sample and never auto-approves the coffee, old or edited bills",
    async () => {
      process.env.GROQ_API_KEY = LIVE_KEY;
      const rows: string[] = [];
      for (const c of cases) {
        const r = await check(c.sample, c.category);
        const extract = r.stages.find((s) => s.key === "extract");
        // Present only when the AI wasn't used: no key, or the call failed (wrong key, rate limit, model error).
        const aiProblem = extract?.checks?.find((x) => x.label === "Vision model")?.detail;
        rows.push(
          `${c.sample.padEnd(18)} ${c.category.padEnd(10)} ${r.decision.padEnd(14)} conf ${(r.confidence ?? 0).toFixed(2)}  ${aiProblem ? `AI FAILED: ${aiProblem}` : r.reasons.slice(0, 2).join(" | ")}`,
        );
        // Written after every bill, so `npm run test:ai` can show the results even if a check fails.
        if (process.env.AI_CHECK_REPORT) fs.writeFileSync(process.env.AI_CHECK_REPORT, `${rows.join("\n")}\n`);
        expect(aiProblem, `${c.sample}: the AI didn't read it`).toBeUndefined();
        if (c.expect === "not-approve") expect(r.decision, c.sample).not.toBe("auto_approved");
      }
      console.log(`\nAI verification results (vision model live)\n${rows.join("\n")}\n`);
    },
    480_000,
  );
});

