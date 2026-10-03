import { describe, expect, it } from "vitest";
import { renderSample } from "@/lib/samples";
import { dHash, errorLevelAnalysis, hamming, sha256 } from "@/lib/verification/forensics";
import { acceptedCategories, keywordScores } from "@/lib/verification/classify";

const user = { name: "Alex Morgan", currency: "USD" };

describe("document forensics", () => {
  it("flags a pasted-in total with error level analysis, but not the genuine document", async () => {
    const clean = await errorLevelAnalysis(await renderSample("medical-invoice", user));
    const forged = await errorLevelAnalysis(await renderSample("tampered-invoice", user));
    expect(clean.score).toBeLessThan(0.2);
    expect(forged.score).toBeGreaterThan(0.5);
    expect(forged.largestCluster).toBeGreaterThan(clean.largestCluster);
  });

  it("renders samples deterministically, so a resubmission is a byte-identical duplicate", async () => {
    const a = await renderSample("pharmacy-receipt", user);
    const b = await renderSample("pharmacy-receipt", user);
    expect(sha256(a)).toBe(sha256(b));
    expect(hamming(await dHash(a), await dHash(b))).toBe(0);
  });

  it("classifies document text by purpose", () => {
    const s = keywordScores("City General Hospital outpatient invoice — patient consultation and blood panel");
    expect(s.health).toBeGreaterThan(s.education);
    expect(s.health).toBeGreaterThan(s.housing);
    expect(acceptedCategories("emergency")).toContain("health");
  });
});
