import fs from "node:fs";
import path from "node:path";
import { loadVectors, VECTORS_DIR } from "../contract";

/** Each shared vector file's phone runner (paths from mobile/src). Add one with every new vector file. */
const RUNNERS: Record<string, string> = {
  "device-trust": "lib/api/demo/__tests__/contract-devices.test.ts",
  "emergency-tiers": "lib/api/demo/__tests__/contract-emergency-tiers.test.ts",
  "id-numbers": "lib/api/__tests__/contract-id-numbers.test.ts",
  "money-actions": "lib/api/demo/__tests__/contract-money-actions.test.ts",
  "mpin-policy": "features/mpin/__tests__/contract-mpin-policy.test.ts",
  "sip-mpin": "lib/__tests__/contract-sip-mpin.test.ts",
  "untrusted-cap": "lib/api/demo/__tests__/contract-devices.test.ts",
  "wallet-maths": "lib/api/demo/__tests__/contract-wallet-maths.test.ts",
};

describe("contract vectors on the phone", () => {
  it("finds the shared vectors", () => {
    expect(fs.existsSync(VECTORS_DIR)).toBe(true);
  });

  it("has a phone runner for every vector file", () => {
    const rules = fs
      .readdirSync(VECTORS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    expect(rules).toEqual(Object.keys(RUNNERS).sort());
    for (const [rule, runner] of Object.entries(RUNNERS)) {
      expect(loadVectors(rule).rule).toBe(rule);
      expect(fs.existsSync(path.resolve(__dirname, "../..", runner))).toBe(true);
    }
  });
});
