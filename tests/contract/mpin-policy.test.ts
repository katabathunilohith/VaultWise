import { describe, expect, it } from "vitest";
import { birthDateAsPin, checkNewMpin, lockMsAfter, triesLeftAfter, waitText } from "@/lib/mpin";
import { casesOf, expectSections, loadVectors } from "./vectors";

const file = loadVectors("mpin-policy");

describe(`contract: ${file.rule} (server)`, () => {
  it("covers every section", () => expectSections(file, ["checkNewMpin", "birthDateAsPin", "lockMsAfter", "triesLeftAfter", "waitText"]));

  describe("checkNewMpin", () => {
    for (const c of casesOf<{ pin: string; dob?: string | null }, unknown>(file, "checkNewMpin"))
      it(c.why, () => expect(checkNewMpin(c.input.pin, { dob: c.input.dob })).toEqual(c.expected));
  });

  describe("birthDateAsPin", () => {
    for (const c of casesOf<{ dob: string | null }, string | null>(file, "birthDateAsPin")) it(c.why, () => expect(birthDateAsPin(c.input.dob)).toBe(c.expected));
  });

  describe("lockMsAfter", () => {
    for (const c of casesOf<{ failures: number }, number | null>(file, "lockMsAfter")) it(c.why, () => expect(lockMsAfter(c.input.failures)).toBe(c.expected));
  });

  describe("triesLeftAfter", () => {
    for (const c of casesOf<{ failures: number }, number>(file, "triesLeftAfter")) it(c.why, () => expect(triesLeftAfter(c.input.failures)).toBe(c.expected));
  });

  describe("waitText", () => {
    for (const c of casesOf<{ ms: number }, string>(file, "waitText")) it(c.why, () => expect(waitText(c.input.ms)).toBe(c.expected));
  });
});
