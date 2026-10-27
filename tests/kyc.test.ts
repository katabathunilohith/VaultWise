import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { redactProviderText } from "@/lib/groq";
import { all, get } from "@/lib/db";
import { createUser, HttpError, type User } from "@/lib/users";
import { docTypesFor, maskEmail, maskId, normaliseId, validateIdNumber, verhoeffDigit, verhoeffValid } from "@/lib/kyc/ids";
import { idHash } from "@/lib/kyc/secret";
import { compareNames } from "@/lib/kyc/names";
import { setIdExtractor } from "@/lib/kyc/analyse";
import type { IdExtraction } from "@/lib/kyc/extract";
import { decideKyc, kycQueue, kycView, submitKyc } from "@/lib/kyc/service";
import { GET as getKyc } from "@/app/api/v1/kyc/route";

/** A valid-looking Aadhaar number (12 digits, not starting 0/1, Verhoeff check digit). */
function aadhaar(seed: number) {
  const base = String(23456789012 + seed * 7919).slice(0, 11);
  return base + verhoeffDigit(base);
}

let imageSeed = 0;
async function idImage() {
  imageSeed++;
  return {
    buffer: await sharp({ create: { width: 640, height: 400, channels: 3, background: { r: 230, g: 235 - imageSeed, b: 240 } } }).jpeg().toBuffer(),
    mime: "image/jpeg",
  };
}

function user(name: string, country = "IN") {
  const u = createUser({ name, country, pin: "1234", kycStatus: "pending" });
  return () => get<User>("SELECT * FROM users WHERE id = ?", u.id)!;
}

const reads = (x: Partial<IdExtraction>) => async (): Promise<IdExtraction> => ({
  is_id_document: true,
  doc_type: "aadhaar",
  name: null,
  dob: "1990-04-01",
  id_number: null,
  expiry: null,
  legibility: 0.95,
  ...x,
});

afterEach(() => {
  setIdExtractor(null);
  delete process.env.IDENTITY_SECRET;
  delete process.env.FIREBASE_PROJECT_ID;
});

describe("ID number formats", () => {
  it("implements Verhoeff", () => {
    expect(verhoeffDigit("236")).toBe("3"); // the textbook example
    expect(verhoeffValid("2363")).toBe(true);
    expect(verhoeffValid("2364")).toBe(false);
    const n = aadhaar(1);
    expect(verhoeffValid(n)).toBe(true);
    const flipped = n.slice(0, 11) + String((Number(n[11]) + 1) % 10);
    expect(verhoeffValid(flipped)).toBe(false);
    // Swapping two neighbouring digits is caught too.
    const swapped = n[1] + n[0] + n.slice(2);
    if (swapped !== n) expect(verhoeffValid(swapped)).toBe(false);
  });

  it("validates Aadhaar", () => {
    const n = aadhaar(2);
    expect(validateIdNumber("aadhaar", `${n.slice(0, 4)} ${n.slice(4, 8)} ${n.slice(8)}`)).toEqual({ ok: true, number: n });
    expect(validateIdNumber("aadhaar", n.slice(0, 11)).ok).toBe(false);
    expect(validateIdNumber("aadhaar", "1" + n.slice(1)).ok).toBe(false); // can't start with 0 or 1
    const bad = n.slice(0, 11) + String((Number(n[11]) + 3) % 10);
    expect(validateIdNumber("aadhaar", bad)).toMatchObject({ ok: false, reason: expect.stringContaining("doesn't look right") });
  });

  it("validates the other ID types", () => {
    expect(validateIdNumber("pan", "abcde1234f")).toEqual({ ok: true, number: "ABCDE1234F" });
    expect(validateIdNumber("pan", "ABCD1234F").ok).toBe(false);
    expect(validateIdNumber("passport", "A1234567", "IN").ok).toBe(true);
    expect(validateIdNumber("passport", "A123456", "IN").ok).toBe(false);
    expect(validateIdNumber("passport", "123456789", "US").ok).toBe(true);
    expect(validateIdNumber("passport", "123456789", null).ok).toBe(true);
    expect(validateIdNumber("driving_licence", "MH12 20110012345").ok).toBe(true);
    expect(validateIdNumber("driving_licence", "MH-1220110012345").ok).toBe(true);
    expect(validateIdNumber("driving_licence", "MH1220110012").ok).toBe(false);
    expect(validateIdNumber("voter_id", "ABC1234567").ok).toBe(true);
    expect(validateIdNumber("voter_id", "AB12345678").ok).toBe(false);
    expect(validateIdNumber("national_id", "X12-345").ok).toBe(true);
    expect(validateIdNumber("national_id", "X1").ok).toBe(false);
    expect(validateIdNumber("national_id", "").ok).toBe(false);
  });

  it("lists the ID types per market", () => {
    expect(docTypesFor("IN")).toEqual(["aadhaar", "pan", "passport", "driving_licence", "voter_id"]);
    expect(docTypesFor("US")).toEqual(["passport", "national_id"]);
  });
});

describe("masking and matching", () => {
  it("masks numbers and emails", () => {
    expect(maskId("aadhaar", "1234")).toBe("XXXX XXXX 1234");
    expect(maskId("pan", "234F")).toBe("XXXX234F");
    expect(maskEmail("shaik@outlook.com")).toBe("s***k@outlook.com");
    expect(maskEmail("al@x.io")).toBe("a***@x.io");
    expect(maskEmail(null)).toBeNull();
  });

  it("HMACs a number the same way however it is typed, and only with the same secret", () => {
    const n = aadhaar(3);
    const spaced = `${n.slice(0, 4)} ${n.slice(4, 8)} ${n.slice(8)}`;
    expect(idHash("aadhaar", n)).toBe(idHash("aadhaar", spaced));
    expect(idHash("aadhaar", n)).toMatch(/^[0-9a-f]{64}$/);
    expect(idHash("aadhaar", n)).not.toContain(n);
    expect(idHash("pan", "ABCDE1234F")).toBe(idHash("pan", "abcde 1234 f"));
    expect(idHash("pan", "ABCDE1234F")).not.toBe(idHash("voter_id", "ABCDE1234F"));
    const before = idHash("aadhaar", n);
    process.env.IDENTITY_SECRET = "another-secret";
    expect(idHash("aadhaar", n)).not.toBe(before);
    expect(normaliseId(" ab-12.3 ")).toBe("AB123");
  });

  it("redacts model output and ID-like numbers from provider errors before logging", () => {
    const n = aadhaar(4);
    const body = JSON.stringify({ error: { message: "Failed to validate JSON", code: "json_validate_failed", failed_generation: `{"id_number": "${n}", "name": "A B"}` } });
    const safe = redactProviderText(body);
    expect(safe).not.toContain(n);
    expect(safe).toContain("[redacted]");
    expect(safe).toContain("json_validate_failed");
    expect(redactProviderText(`oops 2345 6789 0123 and ABCDE1234F`)).toBe("oops [digits] and [id]");
  });

  it("compares names loosely", () => {
    expect(compareNames("AAYAN JAVED SHAIK", "Shaik Aayan Javed").result).toBe("match");
    expect(compareNames("Mr. Alex  Morgan", "alex morgan").result).toBe("match");
    expect(compareNames("S. Aayan Javed", "Shaik Aayan Javed").result).toBe("match");
    expect(compareNames("Priya Sharma", "Alex Morgan").result).toBe("mismatch");
    expect(compareNames(null, "Alex Morgan").result).toBe("unknown");
  });
});

describe("practice provider", () => {
  it("sends the check to a person when AI is off, and stores no full number", async () => {
    const fresh = user("Meera Iyer");
    const n = aadhaar(10);
    const view = await submitKyc(fresh(), { docType: "aadhaar", file: await idImage(), idNumber: n });
    expect(view.status).toBe("needs_review");
    expect(view.idLast4).toBe(n.slice(-4));
    expect(view.reasons.join(" ")).toMatch(/A person will check your ID/);
    expect(fresh().kyc_status).toBe("needs_review");
    const rec = get<Record<string, unknown>>("SELECT * FROM kyc_records WHERE user_id = ?", fresh().id)!;
    expect(rec.id_hash).toBe(idHash("aadhaar", n));
    expect(JSON.stringify(rec)).not.toContain(n);
    const auditRows = all<{ details: string | null }>("SELECT details FROM audit_log WHERE user_id = ?", fresh().id);
    expect(auditRows.map((r) => r.details ?? "").join("")).not.toContain(n);
    // Already in review.
    await expect(submitKyc(fresh(), { docType: "aadhaar", file: await idImage(), idNumber: n })).rejects.toMatchObject({ status: 409, code: "kyc_in_review" });
    // A person decides.
    expect(kycQueue().queue.some((q) => q.userId === fresh().id)).toBe(true);
    decideKyc(rec.id as string, "verified", "ops@example.com", "Card and name checked");
    expect(fresh()).toMatchObject({ kyc_status: "verified", kyc_level: 2 });
    expect(kycView(fresh())).toMatchObject({ status: "verified", docType: "aadhaar", idLast4: n.slice(-4) });
    expect(() => decideKyc(rec.id as string, "rejected", "ops@example.com", "Too late")).toThrow(HttpError);
  });

  it("verifies a clean, confident read", async () => {
    const fresh = user("Aayan Javed Shaik");
    const n = aadhaar(20);
    setIdExtractor(reads({ name: "AAYAN JAVED SHAIK", id_number: n }));
    const view = await submitKyc(fresh(), { docType: "aadhaar", file: await idImage(), idNumber: `${n.slice(0, 4)} ${n.slice(4, 8)} ${n.slice(8)}` });
    expect(view).toMatchObject({ status: "verified", docType: "aadhaar", idLast4: n.slice(-4), reasons: [] });
    expect(fresh()).toMatchObject({ kyc_status: "verified", kyc_level: 2 });
    await expect(submitKyc(fresh(), { docType: "aadhaar", file: await idImage() })).rejects.toMatchObject({ code: "kyc_done" });
  });

  it("sends a duplicate ID or a name mismatch to a person", async () => {
    const n = aadhaar(20); // already verified on the account above
    const other = user("Aayan Javed Shaik");
    setIdExtractor(reads({ name: "AAYAN JAVED SHAIK", id_number: n }));
    const dup = await submitKyc(other(), { docType: "aadhaar", file: await idImage() });
    expect(dup.status).toBe("needs_review");
    expect(dup.reasons.join(" ")).toMatch(/already linked to another account/);

    const mismatch = user("Rahul Verma");
    const m = aadhaar(30);
    setIdExtractor(reads({ name: "PRIYA SHARMA", id_number: m }));
    const res = await submitKyc(mismatch(), { docType: "aadhaar", file: await idImage() });
    expect(res.status).toBe("needs_review");
    expect(res.reasons.join(" ")).toMatch(/name on the card/);

    const wrongTyped = user("Neha Gupta");
    setIdExtractor(reads({ name: "NEHA GUPTA", id_number: aadhaar(40) }));
    const typedOff = await submitKyc(wrongTyped(), { docType: "aadhaar", file: await idImage(), idNumber: aadhaar(41) });
    expect(typedOff.status).toBe("needs_review");
    expect(typedOff.reasons.join(" ")).toMatch(/doesn't match the card/);
  });

  it("refuses bad input before running a check", async () => {
    const fresh = user("Kiran Rao");
    await expect(submitKyc(fresh(), { docType: "aadhaar", file: await idImage(), idNumber: "1234 5678 9012" })).rejects.toMatchObject({
      status: 400,
      code: "invalid_id",
    });
    const us = user("Alex Morgan", "US");
    await expect(submitKyc(us(), { docType: "aadhaar", file: await idImage() })).rejects.toMatchObject({ status: 400, code: "doc_type_not_accepted" });
    expect(get("SELECT 1 FROM kyc_records WHERE user_id = ?", fresh().id)).toBeUndefined();
  });

  it("reserves the check first, so parallel submissions can't both run", async () => {
    const fresh = user("Tara Singh");
    const n = aadhaar(60);
    const results = await Promise.allSettled([
      submitKyc(fresh(), { docType: "aadhaar", file: await idImage(), idNumber: n }),
      submitKyc(fresh(), { docType: "aadhaar", file: await idImage(), idNumber: n }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ status: 409, code: "kyc_in_review" });
    expect(get<{ n: number }>("SELECT COUNT(*) AS n FROM kyc_records WHERE user_id = ?", fresh().id)!.n).toBe(1);
  });

  it("drops the reservation when the upload is bad", async () => {
    const fresh = user("Uma Das");
    await expect(submitKyc(fresh(), { docType: "aadhaar", file: { buffer: Buffer.from("not an image"), mime: "image/jpeg" } })).rejects.toMatchObject({ status: 415 });
    expect(get("SELECT 1 FROM kyc_records WHERE user_id = ?", fresh().id)).toBeUndefined();
  });

  it("deletes the ID photo when a person rejects the check, keeps it when verified", async () => {
    const rejected = user("Vik Rao");
    await submitKyc(rejected(), { docType: "aadhaar", file: await idImage(), idNumber: aadhaar(61) });
    const rec = get<{ id: string; file_path: string }>("SELECT id, file_path FROM kyc_records WHERE user_id = ?", rejected().id)!;
    expect(fs.existsSync(rec.file_path)).toBe(true);
    decideKyc(rec.id, "rejected", "ops@example.com", "The photo is blurry. Take a new one in good light.");
    expect(fs.existsSync(rec.file_path)).toBe(false);
    expect(get<{ file_path: string | null }>("SELECT file_path FROM kyc_records WHERE id = ?", rec.id)!.file_path).toBeNull();
    expect(kycView(rejected())).toMatchObject({ status: "rejected", reasons: ["The photo is blurry. Take a new one in good light."] });

    const verified = user("Wen Li");
    await submitKyc(verified(), { docType: "aadhaar", file: await idImage(), idNumber: aadhaar(62) });
    const v = get<{ id: string; file_path: string }>("SELECT id, file_path FROM kyc_records WHERE user_id = ?", verified().id)!;
    decideKyc(v.id, "verified", "ops@example.com", "Checked");
    expect(fs.existsSync(v.file_path)).toBe(true);
  });

  it("needs IDENTITY_SECRET when sign-in is on", async () => {
    process.env.FIREBASE_PROJECT_ID = "vaultwise-kyc-test";
    expect(() => idHash("pan", "ABCDE1234F")).toThrow(HttpError);
    const fresh = user("Xavier Paul");
    await expect(submitKyc(fresh(), { docType: "pan", file: await idImage(), idNumber: "ABCDE1234F" })).rejects.toMatchObject({ status: 500, code: "server_config" });
    expect(get("SELECT 1 FROM kyc_records WHERE user_id = ?", fresh().id)).toBeUndefined();
    process.env.IDENTITY_SECRET = "set";
    expect(idHash("pan", "ABCDE1234F")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("serves GET /api/v1/kyc in prototype mode for the first user", async () => {
    const res = await (getKyc as unknown as (r: Request) => Promise<Response>)(new Request("http://localhost/api/v1/kyc"));
    expect(res.status).toBe(200);
    expect(Object.keys(await res.json()).sort()).toEqual(["docType", "idLast4", "reasons", "status", "updatedAt"]);
  });
});
