import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadVectors, VECTORS_DIR, vectorRules } from "./vectors";

/** Each rule's server runner, next to this file. Add the runner (and the phone's) with a new vector file. */
const RUNNERS: Record<string, string> = {
  "device-trust": "devices.test.ts",
  "emergency-tiers": "emergency-tiers.test.ts",
  "id-numbers": "id-numbers.test.ts",
  "money-actions": "money-actions.test.ts",
  "mpin-policy": "mpin-policy.test.ts",
  "sip-mpin": "sip-mpin.test.ts",
  "untrusted-cap": "devices.test.ts",
  "wallet-maths": "wallet-maths.test.ts",
};

describe("contract vector files", () => {
  it("every vector file has a server runner", () => {
    expect(vectorRules()).toEqual(Object.keys(RUNNERS).sort());
    for (const runner of new Set(Object.values(RUNNERS))) expect(fs.existsSync(path.join(VECTORS_DIR, "..", runner))).toBe(true);
  });

  for (const rule of vectorRules()) {
    it(`${rule}.json is well formed`, () => {
      const file = loadVectors(rule);
      expect(file.rule).toBe(rule);
      for (const key of ["about", "server", "phone"] as const) expect(typeof file[key] === "string" && file[key].length > 0).toBe(true);
      expect(Object.keys(file.cases).length).toBeGreaterThan(0);
      for (const [section, cases] of Object.entries(file.cases)) {
        expect(Array.isArray(cases) && cases.length > 0, `${rule}.${section} has cases`).toBe(true);
        const whys = new Set<string>();
        for (const c of cases) {
          expect(typeof c.why === "string" && c.why.length > 0, `${rule}.${section}: every case says why`).toBe(true);
          expect(whys.has(c.why), `${rule}.${section}: "${c.why}" is used once`).toBe(false);
          whys.add(c.why);
          expect("input" in c && "expected" in c, `${rule}.${section}: "${c.why}" has input and expected`).toBe(true);
        }
      }
    });
  }
});
