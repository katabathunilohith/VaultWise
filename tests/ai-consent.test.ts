import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { aiConsented, AI_CONSENT_HEADER } from "@/lib/ai-consent";
import { withRequest } from "@/lib/auth/context";
import { all, get } from "@/lib/db";
import { weeklyInsight } from "@/lib/engagement";
import { analyseId, setIdExtractor } from "@/lib/kyc/analyse";
import type { IdExtraction } from "@/lib/kyc/extract";
import { transfer, userAccount, worldAccount } from "@/lib/ledger";
import { createUser, type User } from "@/lib/users";
import { createVault, createWithdrawal, deposit } from "@/lib/vaults";
import { createProof, runPipeline } from "@/lib/verification/pipeline";
import { seedDemo } from "@/lib/seed";
import { POST as assistant } from "@/app/api/v1/assistant/route";

/** The person's answer to "may an AI read this?" (phone and web): only a "yes" lets data reach the AI provider. */

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
  it("is a no unless the request says yes (plan 05: a missing header means no)", async () => {
    expect(await withRequest(asked(), aiConsented)).toBe(false);
    expect(await withRequest(asked("yes"), aiConsented)).toBe(true);
    expect(await withRequest(asked(" YES "), aiConsented)).toBe(true);
    expect(await withRequest(asked("no"), aiConsented)).toBe(false);
    expect(await withRequest(asked(" NO "), aiConsented)).toBe(false);
    expect(await withRequest(asked("maybe"), aiConsented)).toBe(false);
    // No request at all (scripts, background work): no.
    expect(await aiConsented()).toBe(false);
  });
});

describe("the assistant", () => {
  const chat = (answer?: string) =>
    new Request("http://localhost/api/v1/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", ...(answer ? { [AI_CONSENT_HEADER]: answer } : {}) },
      body: JSON.stringify({ messages: [{ role: "user", content: "How am I doing?" }] }),
    });

  it("refuses without a yes, before anything reaches the AI provider", async () => {
    process.env.GROQ_API_KEY = "never-used";
    for (const answer of [undefined, "no"]) {
      const r = await assistant(chat(answer));
      expect(r.status).toBe(403);
      expect(await r.json()).toMatchObject({ code: "ai_consent_required" });
    }
  });

  it("goes on with a yes (here to the no-key answer, so nothing is called)", async () => {
    const r = await assistant(chat("yes"));
    expect(r.status).toBe(503);
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
    const unanswered = await withRequest(asked(), () => analyseId(input));
    expect(calls).toBe(0);
    expect(unanswered.aiUsed).toBe(false);
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

describe("the proofs table's default", () => {
  it("is 'no' for new databases, and every insert says it explicitly (the practice data included)", async () => {
    const info = all<{ name: string; dflt_value: string | null }>("PRAGMA table_info(proofs)");
    expect(info.find((c) => c.name === "ai_allowed")?.dflt_value).toBe("0");

    // The practice data passes ai_allowed itself: with the default now "no", its rows would read 0 otherwise.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("offline in tests");
    }) as typeof fetch;
    try {
      const u = await seedDemo({ id: "usr_seed_consent", name: "Seed Sam", country: "US", pin: "482915" });
      const rows = all<{ ai_allowed: number }>("SELECT ai_allowed FROM proofs WHERE user_id = ?", u.id);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.ai_allowed === 1)).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  }, 120_000);
});
