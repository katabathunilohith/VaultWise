import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { aiConsented, AI_CONSENT_HEADER } from "@/lib/ai-consent";
import { withRequest } from "@/lib/auth/context";
import { get } from "@/lib/db";
import { weeklyInsight } from "@/lib/engagement";
import { analyseId, setIdExtractor } from "@/lib/kyc/analyse";
import type { IdExtraction } from "@/lib/kyc/extract";
import { transfer, userAccount, worldAccount } from "@/lib/ledger";
import { createUser, type User } from "@/lib/users";
import { createVault, createWithdrawal, deposit } from "@/lib/vaults";
import { createProof, runPipeline } from "@/lib/verification/pipeline";

/** The phone app's answer to "may an AI read this?" keeps a "no" away from the AI provider. */

const asked = (answer?: string) => new Request("http://localhost/api/v1/x", { headers: answer ? { [AI_CONSENT_HEADER]: answer } : {} });

const created = createUser({ name: "Priya Sharma", country: "IN", pin: "2468" });
const fresh = () => get<User>("SELECT * FROM users WHERE id = ?", created.id)!;
transfer({ userId: created.id, from: worldAccount(created.currency).id, to: userAccount(created.id, "bank", created.currency).id, amount: 5_00_000_00, kind: "income", memo: "seed" });

const image = async (shade: number) => ({
  buffer: await sharp({ create: { width: 640, height: 400, channels: 3, background: { r: 230, g: shade, b: 240 } } }).jpeg().toBuffer(),
  mime: "image/jpeg",
});

afterEach(() => {
  setIdExtractor(null);
  delete process.env.GROQ_API_KEY;
});

describe("reading the answer", () => {
  it("is a yes unless the request says no (the web app sends nothing)", async () => {
    expect(await withRequest(asked(), aiConsented)).toBe(true);
    expect(await withRequest(asked("yes"), aiConsented)).toBe(true);
    expect(await withRequest(asked("no"), aiConsented)).toBe(false);
    expect(await withRequest(asked(" NO "), aiConsented)).toBe(false);
  });
});

describe("bills", () => {
  it("go to a person, not the vision model, when the person said no", async () => {
    // A key is set, so only the person's answer keeps the bill away from the AI (nothing is called).
    process.env.GROQ_API_KEY = "never-used";
    const vaultId = createVault(fresh(), { name: "Health fund", category: "health", target: 1_00_000_00 });
    deposit(fresh(), vaultId, 50_000_00);
    const withdrawalId = createWithdrawal(fresh(), vaultId, 2_000_00, "City Clinic");
    const proofId = createProof(fresh(), {
      ...(await image(200)),
      fileName: "bill.jpg",
      purpose: "withdrawal",
      category: "health",
      vaultId,
      withdrawalId,
      aiAllowed: false,
    });
    await runPipeline(proofId);
    const v = get<{ decision: string; reasons: string; stages: string }>("SELECT decision, reasons, stages FROM verifications WHERE proof_id = ?", proofId)!;
    const extract = (JSON.parse(v.stages) as { key: string; status: string }[]).find((s) => s.key === "extract");
    expect(extract?.status).toBe("skipped");
    expect(v.decision).toBe("human_review");
    expect(JSON.parse(v.reasons)[0]).toMatch(/asked for a person/);
    expect(get<{ ai_allowed: number }>("SELECT ai_allowed FROM proofs WHERE id = ?", proofId)?.ai_allowed).toBe(0);
  });
});

describe("ID photos", () => {
  const read: IdExtraction = {
    is_id_document: true,
    doc_type: "pan",
    name: "PRIYA SHARMA",
    dob: null,
    id_number: "ABCPS1234D",
    expiry: null,
    legibility: 0.95,
  };

  it("are not read by the AI when the person said no", async () => {
    let calls = 0;
    setIdExtractor(async () => {
      calls++;
      return read;
    });
    const input = { docType: "pan" as const, file: await image(210), accountName: "Priya Sharma", market: null };
    const declined = await withRequest(asked("no"), () => analyseId(input));
    expect(calls).toBe(0);
    expect(declined.clean).toBe(false);
    expect(declined.aiUsed).toBe(false);
    expect(declined.checks.some((c) => /person to read the card/.test(c.detail))).toBe(true);

    await withRequest(asked("yes"), () => analyseId(input));
    expect(calls).toBe(1);
  });
});

describe("the weekly tip", () => {
  it("uses the rules and isn't cached when the person said no", async () => {
    process.env.GROQ_API_KEY = "never-used";
    const tip = await withRequest(asked("no"), () => weeklyInsight(fresh()));
    expect(tip.source).toBe("rules");
    expect(get("SELECT key FROM ai_cache WHERE key LIKE ?", `insight:${created.id}:%`)).toBeUndefined();
  });
});
