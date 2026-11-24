import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { get } from "@/lib/db";
import { transfer, userAccount, worldAccount } from "@/lib/ledger";
import { renderSample } from "@/lib/samples";
import { createUser, type User } from "@/lib/users";
import { createVault, createWithdrawal, deposit } from "@/lib/vaults";
import { createProof, runPipeline, setBillReader, type Extraction } from "@/lib/verification/pipeline";
import { keywordScores } from "@/lib/verification/classify";
import { normaliseExtraction, parseAmount } from "@/lib/verification/stages/ai-read";
import { decide, type DecisionInput } from "@/lib/verification/stages/decision";
import { evaluateRules, UNREAD_SCORES, type RulesInput } from "@/lib/verification/stages/rules";
import { assessTamper, contentKeys, metadataScore, tamperScoreOf, type TamperSignals } from "@/lib/verification/stages/tamper";

/** The pipeline's stages as separate units (src/lib/verification/stages), plus one run through a stand-in reader. */

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-24T00:00:00Z");
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10);

function bill(over: Partial<Extraction> = {}): Extraction {
  return {
    is_document: true,
    document_type: "medical_invoice",
    issuer: "City General Hospital",
    recipient_name: "Priya Sharma",
    document_date: iso(4),
    total_amount: 23800,
    subtotal: 23800,
    tax: 0,
    currency: "INR",
    reference_number: "INV-20995",
    line_items: [
      { description: "Cardiology consultation", amount: 12000 },
      { description: "Electrocardiogram (ECG)", amount: 6800 },
      { description: "Comprehensive blood panel", amount: 5000 },
    ],
    category_scores: { health: 0.9, education: 0.02, housing: 0.02, emergency: 0.05, retirement: 0, other: 0.02 },
    purpose_match: 0.9,
    editing_signs: [],
    legibility: 0.95,
    text: "City General Hospital outpatient invoice: patient consultation, ECG and blood panel",
    summary: "A hospital invoice",
    ...over,
  };
}
const RULES: RulesInput = { template: "health", vaultName: "Medical bills", requested: 23800_00, userName: "Priya Sharma", currency: "INR", maxDocAgeDays: 120, now: NOW };

describe("rules stage (evaluateRules)", () => {
  it("passes a recent, matching, fully covered bill", () => {
    const r = evaluateRules(bill(), RULES);
    expect(r.hardFails).toEqual([]);
    expect(r.checks.every((c) => c.status === "pass")).toBe(true);
    expect(r.scores).toMatchObject({ amountScore: 1, dateScore: 1, nameScore: 1, arithmetic: "ok" });
    expect(r.scores.matchScore).toBeGreaterThan(0.7);
  });

  it("fails an old bill without declining it outright, and hard-fails a future date", () => {
    const old = evaluateRules(bill({ document_date: iso(121) }), RULES);
    expect(old.scores.dateScore).toBe(0.2);
    expect(old.checks.find((c) => c.label === "Document date")).toMatchObject({ status: "fail", detail: "121 days old (policy: 120)" });
    expect(old.hardFails).toEqual([]);
    const future = evaluateRules(bill({ document_date: iso(-5) }), RULES);
    expect(future.hardFails).toEqual([{ reason: "The document is dated in the future", forensic: false }]);
  });

  it("hard-fails a bill for another purpose and flags totals that don't add up", () => {
    const coffee = bill({
      document_type: "retail_receipt",
      issuer: "Brew & Co.",
      text: "Oat latte, croissant",
      line_items: [{ description: "Oat latte", amount: 420 }],
      category_scores: { other: 0.9 },
      purpose_match: 0.05,
    });
    expect(evaluateRules(coffee, RULES).hardFails).toEqual([{ reason: "The document doesn't match the Health / Medical purpose", forensic: false }]);
    const inflated = evaluateRules(bill({ total_amount: 103800 }), { ...RULES, requested: 103800_00 });
    expect(inflated.scores.arithmetic).toBe("mismatch");
    expect(inflated.flags).toEqual([{ severity: "high", text: "Document total doesn't match its own line items" }]);
  });

  it("scores a dependant's bill by family name and a short bill as not covering the request", () => {
    const r = evaluateRules(bill({ recipient_name: "Aarav Sharma", total_amount: 10000 }), RULES);
    expect(r.scores.nameScore).toBe(0.6);
    expect(r.scores.amountScore).toBeCloseTo((10000_00 / 23800_00) * 0.6, 6);
    expect(r.checks.find((c) => c.label === "Amount covered")?.status).toBe("fail");
  });
});

describe("decision stage (decide)", () => {
  const input = (over: Partial<DecisionInput> = {}): DecisionInput => ({
    extraction: { document_type: "medical_invoice" },
    aiAllowed: true,
    extractionScore: 0.99,
    scores: { matchScore: 0.9, amountScore: 1, dateScore: 1, nameScore: 1, arithmetic: "ok" },
    tamper: { score: 0, scoreWithoutEla: 0, elaOnly: false },
    hardFails: [],
    reviewReasons: [],
    strictest: false,
    checks: { extract: [], classify: [], tamper: [] },
    autoApprove: 0.85,
    autoDeny: 0.35,
    ...over,
  });

  it("approves a clean, confident case and declines on any hard fail", () => {
    const ok = decide(input());
    expect(ok.decision).toBe("auto_approved");
    expect(ok.confidence).toBeCloseTo(0.15 * 0.99 + 0.35 * 0.9 + 0.15 + 0.1 + 0.05 + 0.2, 10);
    expect(ok.reasons[0]).toMatch(/medical invoice supports the withdrawal/);
    expect(decide(input({ hardFails: [{ reason: "This exact file was already used as proof", forensic: false }] }))).toMatchObject({
      decision: "auto_denied",
      reasons: ["This exact file was already used as proof"],
    });
  });

  it("never declines a customer who asked for a person on image forensics, only on a non-forensic hard fail", () => {
    const altered = { reason: "Strong signs that the document was digitally altered", forensic: true };
    const duplicate = { reason: "This exact file was already used as proof", forensic: false };
    const asked = { extraction: null, aiAllowed: false, scores: UNREAD_SCORES, tamper: { score: 0.925, scoreWithoutEla: 0.5, elaOnly: false } };
    expect(decide(input({ ...asked, hardFails: [altered] }))).toMatchObject({
      decision: "human_review",
      reasons: ["You asked for a person to read this instead of the AI, so a person will check it"],
    });
    expect(decide(input({ ...asked, hardFails: [altered, duplicate] }))).toMatchObject({ decision: "auto_denied", reasons: [duplicate.reason] });
    // With consent (here the read failed), corroborated forensic evidence still declines.
    expect(decide(input({ ...asked, aiAllowed: true, hardFails: [altered] }))).toMatchObject({ decision: "auto_denied", reasons: [altered.reason] });
  });

  it("doesn't decline on low confidence when only uncorroborated ELA made it low", () => {
    const weak = { scores: { matchScore: 0.2, amountScore: 0.2, dateScore: 0.2, nameScore: 0.35, arithmetic: "ok" as const }, extractionScore: 0.6 };
    // Without ELA this case sits at 0.43: a person. ELA at 100% (tamper 0.85) drops it to 0.26.
    const elaOnly = decide(input({ ...weak, tamper: { score: 0.85, scoreWithoutEla: 0, elaOnly: true } }));
    expect(elaOnly.confidence).toBeLessThan(0.35);
    expect(elaOnly.decision).toBe("human_review");
    expect(decide(input({ ...weak, tamper: { score: 0.85, scoreWithoutEla: 0.6, elaOnly: false } })).decision).toBe("auto_denied");
  });

  it("never approves with a failed check, a custom vault, or nothing read", () => {
    const stale = decide(input({ checks: { extract: [], classify: [{ label: "Document date", status: "fail", detail: "300 days old" }], tamper: [] } }));
    expect(stale).toMatchObject({ decision: "human_review", reasons: ["Document date: 300 days old"] });
    expect(decide(input({ strictest: true })).reasons[0]).toMatch(/Custom vaults/);
    const unread = decide(input({ extraction: null, aiAllowed: false, scores: UNREAD_SCORES }));
    expect(unread.decision).toBe("human_review");
    expect(unread.confidence).toBeLessThanOrEqual(0.6);
    expect(unread.reasons[0]).toMatch(/asked for a person/);
  });
});

describe("keyword classifier", () => {
  it("matches terms at the start of a word, not inside another word", () => {
    // Found by the evaluation: "Please retain this document" gave a resort bill housing evidence ("lease").
    expect(keywordScores("Seabreeze Beach Resort. Thank you. Please retain this document.").housing).toBe(0);
    expect(keywordScores("Gulab jamun, filter coffee, current charges, forwarded").hits).toMatchObject({ health: [], education: [], housing: [] });
    const lab = keywordScores("Metro Path Labs · Laboratory fee · diagnosis");
    expect(lab.hits.health).toEqual(expect.arrayContaining(["lab", "diagnos"]));
    expect(lab.hits.education).toContain("fee");
  });
});

describe("tamper stage (assessTamper)", () => {
  const none: TamperSignals = { ela: 0, software: false, timestampGap: false, signs: 0, arithmetic: "ok", perceptualReuse: false };

  it("sends ELA on its own to a person, however strong", () => {
    const a = assessTamper({ ...none, ela: 1 });
    expect(a.score).toBeCloseTo(0.85, 10);
    expect(a).toMatchObject({ elaOnly: true, decline: false, corroborating: [] });
    expect(a.scoreWithoutEla).toBe(0);
    // A small gap in the totals (≤ 25%) is often a misread, so it doesn't corroborate.
    expect(assessTamper({ ...none, ela: 1, arithmetic: "minor" })).toMatchObject({ elaOnly: true, decline: false });
  });

  it("declines strong ELA backed by any corroborating signal", () => {
    for (const extra of [{ software: true }, { timestampGap: true }, { arithmetic: "mismatch" as const }, { signs: 1 }, { perceptualReuse: true }]) {
      const a = assessTamper({ ...none, ela: 1, ...extra });
      expect(a.decline, JSON.stringify(extra)).toBe(true);
      expect(a.corroborating).toHaveLength(1);
    }
    // Weak ELA plus a corroborating signal stays under the line: a person.
    expect(assessTamper({ ...none, ela: 0.3, software: true }).decline).toBe(false);
  });

  it("combines editing software and a capture-date gap instead of taking the larger", () => {
    expect(metadataScore({ software: true, timestampGap: false })).toBe(0.5);
    expect(metadataScore({ software: false, timestampGap: true })).toBeCloseTo(0.7, 10);
    expect(metadataScore({ software: true, timestampGap: true })).toBeCloseTo(0.85, 10);
    expect(assessTamper({ ...none, software: true, timestampGap: true })).toMatchObject({ decline: true, elaOnly: false });
    expect(assessTamper({ ...none, timestampGap: true }).decline).toBe(false);
    // Unchanged: software with totals that don't add up, or three edit signs, still decline without ELA.
    expect(assessTamper({ ...none, software: true, arithmetic: "mismatch" }).decline).toBe(true);
    expect(assessTamper({ ...none, signs: 3 }).decline).toBe(true);
  });
});

describe("tamper and reading helpers", () => {
  it("combines tamper signals and fingerprints document content", () => {
    expect(tamperScoreOf({ ela: 1, exifScore: 0, signs: 0, arithmetic: "ok" })).toBeCloseTo(0.85, 10);
    expect(tamperScoreOf({ ela: 0, exifScore: 0.5, signs: 0, arithmetic: "mismatch" })).toBeCloseTo(0.8, 10);
    expect(contentKeys(bill({ issuer: "City General Hospital!", reference_number: "inv 20995" }))).toEqual([
      "ref:citygeneralhospital:inv20995",
      `amt:citygeneralhospital:23800.00:${iso(4)}`,
    ]);
    expect(contentKeys({ reference_number: "INV-1" })).toEqual([]);
  });

  it("coerces the model's numbers and fills defaults", () => {
    const x = normaliseExtraction({ ...bill(), total_amount: "₹1,200.50", legibility: 4, line_items: [{ description: 7, amount: "Rs. 99" }] } as unknown as Extraction);
    expect(x.total_amount).toBe(1200.5);
    expect(x.legibility).toBe(1);
    // "Rs. 99" used to become 0.99: the "." of "Rs." survived the strip.
    expect(x.line_items).toEqual([{ description: "7", amount: 99 }]);
    expect([parseAmount("Rs. 500/-"), parseAmount("INR 2,34,500.00"), parseAmount(23800), parseAmount("n/a"), parseAmount(0)]).toEqual([500, 234500, 23800, null, null]);
  });
});

describe("a run through a stand-in bill reader", () => {
  afterEach(() => setBillReader(null));

  const created = createUser({ name: "Priya Sharma", country: "IN", pin: "2468" });
  const fresh = () => get<User>("SELECT * FROM users WHERE id = ?", created.id)!;
  transfer({ userId: created.id, from: worldAccount(created.currency).id, to: userAccount(created.id, "bank", created.currency).id, amount: 10_00_000_00, kind: "income", memo: "seed" });
  const vaultId = createVault(fresh(), { name: "Medical bills", category: "health", target: 5_00_000_00 });
  deposit(fresh(), vaultId, 2_00_000_00);

  async function submit(buffer: Buffer, aiAllowed = true) {
    const withdrawalId = createWithdrawal(fresh(), vaultId, 23_800_00, "City General Hospital");
    const proofId = createProof(fresh(), { buffer, fileName: "bill.jpg", mime: "image/jpeg", purpose: "withdrawal", category: "health", vaultId, withdrawalId, aiAllowed });
    await runPipeline(proofId);
    const v = get<{ decision: string; reasons: string }>("SELECT decision, reasons FROM verifications WHERE proof_id = ?", proofId)!;
    return { decision: v.decision, reasons: JSON.parse(v.reasons) as string[], withdrawal: get<{ status: string }>("SELECT status FROM withdrawals WHERE id = ?", withdrawalId)!.status };
  }

  it("approves and pays a well-read genuine bill, declines the same bill re-encoded, and never reads without consent", async () => {
    let calls = 0;
    setBillReader(async () => {
      calls++;
      return bill({ document_date: new Date(Date.now() - 4 * DAY).toISOString().slice(0, 10) });
    });
    const original = await renderSample("medical-invoice", fresh());

    expect(await submit(original)).toMatchObject({ decision: "auto_approved", withdrawal: "paid" });
    const again = await submit(await sharp(original).jpeg({ quality: 60 }).toBuffer());
    expect(again).toMatchObject({ decision: "auto_denied", withdrawal: "denied" });
    expect(again.reasons).toContain("This document was already used to justify another withdrawal");
    expect(calls).toBe(2);

    const declined = await submit(await renderSample("pharmacy-receipt", fresh()), false);
    expect(calls).toBe(2);
    expect(declined.decision).toBe("human_review");
  });
});

describe("tamper policy, end to end", () => {
  afterEach(() => setBillReader(null));

  const created = createUser({ name: "Ravi Kumar", country: "IN", pin: "2468" });
  const fresh = () => get<User>("SELECT * FROM users WHERE id = ?", created.id)!;
  transfer({ userId: created.id, from: worldAccount(created.currency).id, to: userAccount(created.id, "bank", created.currency).id, amount: 10_00_000_00, kind: "income", memo: "seed" });
  const vaultId = createVault(fresh(), { name: "Clinic visits", category: "health", target: 5_00_000_00 });
  deposit(fresh(), vaultId, 3_00_000_00);

  /** A well-read bill with its own issuer and number each time, so no two submissions share content keys. */
  let n = 0;
  const readCleanly = () =>
    setBillReader(async () =>
      bill({ issuer: `Lakeside Clinic ${++n}`, reference_number: `LC-${9000 + n}`, recipient_name: "Ravi Kumar", document_date: new Date(Date.now() - 3 * DAY).toISOString().slice(0, 10) }),
    );

  /** A sample photo with a large pasted patch in another font, re-saved at q95 (and optionally by an editor). */
  async function forge(sample: string, software?: string) {
    const patch = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="150"><rect width="100%" height="100%" fill="#ffffff"/>
      <text x="12" y="60" font-family="Times New Roman, serif" font-size="40">Rs. 98,400.00</text>
      <text x="12" y="120" font-family="Times New Roman, serif" font-size="40">Paid in full</text></svg>`;
    let img = sharp(await renderSample(sample, fresh()))
      .composite([{ input: await sharp(Buffer.from(patch)).png().toBuffer(), left: 300, top: 560 }])
      .jpeg({ quality: 95 });
    if (software) img = img.withExif({ IFD0: { Software: software } });
    return img.toBuffer();
  }

  async function submit(buffer: Buffer, aiAllowed = true) {
    const withdrawalId = createWithdrawal(fresh(), vaultId, 23_800_00, "Lakeside Clinic");
    const proofId = createProof(fresh(), { buffer, fileName: "bill.jpg", mime: "image/jpeg", purpose: "withdrawal", category: "health", vaultId, withdrawalId, aiAllowed });
    await runPipeline(proofId);
    const v = get<{ decision: string; reasons: string; stages: string }>("SELECT decision, reasons, stages FROM verifications WHERE proof_id = ?", proofId)!;
    const tamper = (JSON.parse(v.stages) as { key: string; data?: Record<string, unknown> }[]).find((s) => s.key === "tamper")!.data!;
    return { decision: v.decision, reasons: JSON.parse(v.reasons) as string[], tamper };
  }

  it("sends a bill to a person when error level analysis is the only sign of editing", async () => {
    readCleanly();
    const r = await submit(await forge("tuition-invoice"));
    expect(r.tamper.elaScore).toBeGreaterThanOrEqual(0.95); // strong enough that it used to decline on its own
    expect(r.tamper).toMatchObject({ elaOnly: true, corroborating: [] });
    expect(r.decision).toBe("human_review");
    expect(r.reasons.some((x) => x.startsWith("Tamper evidence: Error level analysis alone"))).toBe(true);
  });

  it("declines it when editing software in the metadata corroborates the ELA finding", async () => {
    readCleanly();
    const r = await submit(await forge("rent-receipt", "Adobe Photoshop 25.1"));
    expect(r.tamper.corroborating).toEqual(["editing software in the metadata"]);
    expect(r).toMatchObject({ decision: "auto_denied", reasons: ["Strong signs that the document was digitally altered"] });
  });

  it("sends the same evidence to a person when the customer asked for one, but still declines an exact duplicate", async () => {
    const image = await forge("old-invoice", "Adobe Photoshop 25.1");
    const asked = await submit(image, false);
    expect(asked.tamper.elaScore).toBeGreaterThanOrEqual(0.95);
    expect(asked.decision).toBe("human_review");
    expect(asked.reasons[0]).toMatch(/asked for a person/);
    expect(await submit(image, false)).toMatchObject({ decision: "auto_denied", reasons: ["This exact file was already used as proof"] });
  });

  it("ignores ELA on a genuine bill saved at the ELA quality, and approves a clean read", async () => {
    readCleanly();
    const r = await submit(await sharp(await renderSample("pharmacy-receipt", fresh())).jpeg({ quality: 75 }).toBuffer());
    expect(r.tamper).toMatchObject({ elaInconclusive: true, tamperScore: 0 });
    expect(r.decision).toBe("auto_approved");
  });
});
