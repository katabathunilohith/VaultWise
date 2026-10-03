import { describe, expect, it } from "vitest";
import { renderSample } from "@/lib/samples";
import sharp from "sharp";
import { dHash, ELA_MAX_PIXELS, errorLevelAnalysis, hamming, probeImage, sha256 } from "@/lib/verification/forensics";
import { validateUpload } from "@/lib/verification/pipeline";
import { acceptedCategories, keywordScores } from "@/lib/verification/classify";

const user = { name: "Alex Morgan", currency: "USD" };

describe("document forensics", () => {
  it("flags a pasted-in total with error level analysis, but not the genuine document", async () => {
    const clean = (await errorLevelAnalysis(await renderSample("medical-invoice", user)))!;
    const forged = (await errorLevelAnalysis(await renderSample("tampered-invoice", user)))!;
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

  it("skips ELA (instead of failing) for photos above the size limit", async () => {
    const big = await sharp({ create: { width: 6000, height: 4500, channels: 3, background: "#f5f5f0" } })
      .jpeg()
      .toBuffer();
    expect(6000 * 4500).toBeGreaterThan(ELA_MAX_PIXELS);
    expect(await errorLevelAnalysis(big)).toBeNull();
    expect(await dHash(big)).toHaveLength(64);
  });

  it("rejects unreadable or unsupported uploads with a helpful 415", async () => {
    expect(await probeImage(Buffer.from("not an image at all"))).toBeNull();
    await expect(validateUpload(Buffer.from("not an image at all"), "image/jpeg")).rejects.toMatchObject({ status: 415 });
    await expect(validateUpload(Buffer.from("x"), "image/heic")).rejects.toThrow(/HEIC/);
    await expect(validateUpload(Buffer.alloc(11 * 1024 * 1024), "image/png")).rejects.toMatchObject({ status: 413 });
    const ok = await renderSample("rent-receipt", user);
    await expect(validateUpload(ok, "image/jpeg")).resolves.toBeUndefined();
  });
});
