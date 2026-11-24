import { describe, expect, it } from "vitest";
import { docTypesFor, last4, maskId, normaliseId, validateIdNumber, type DocType } from "@/lib/kyc/ids";
import { casesOf, expectSections, loadVectors } from "./vectors";

const file = loadVectors("id-numbers");

/** Mask characters read as * (the server shows X, the phone •). */
const maskShape = (s: string) => s.replace(/[X•]/g, "*");

describe(`contract: ${file.rule} (server)`, () => {
  it("covers every section", () => expectSections(file, ["docTypesFor", "normaliseId", "validateIdNumber", "last4", "maskId"]));

  describe("docTypesFor", () => {
    for (const c of casesOf<{ market: string }, string[]>(file, "docTypesFor")) it(c.why, () => expect(docTypesFor(c.input.market)).toEqual(c.expected));
  });

  describe("normaliseId", () => {
    for (const c of casesOf<{ raw: string }, string>(file, "normaliseId")) it(c.why, () => expect(normaliseId(c.input.raw)).toBe(c.expected));
  });

  describe("validateIdNumber", () => {
    for (const c of casesOf<{ docType: DocType; raw: string; market: string | null }, { ok: boolean; number?: string }>(file, "validateIdNumber"))
      it(c.why, () => {
        const r = validateIdNumber(c.input.docType, c.input.raw, c.input.market);
        // The refusal's wording is display text; only ok and the cleaned-up number are the contract.
        expect(r.ok ? { ok: true, number: r.number } : { ok: false }).toEqual(c.expected);
      });
  });

  describe("last4", () => {
    for (const c of casesOf<{ raw: string }, string>(file, "last4")) it(c.why, () => expect(last4(c.input.raw)).toBe(c.expected));
  });

  describe("maskId", () => {
    for (const c of casesOf<{ docType: string | null; idLast4: string | null }, string>(file, "maskId"))
      it(c.why, () => expect(maskShape(maskId(c.input.docType, c.input.idLast4))).toBe(c.expected));
  });
});
