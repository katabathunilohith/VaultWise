import { describe, expect, it } from "vitest";
import { sipNeedsMpin, type SipFrequency } from "@/lib/invest/sip-rule";
import { casesOf, expectSections, loadVectors } from "./vectors";

const file = loadVectors("sip-mpin");

interface Input {
  current: { amount: number; frequency: SipFrequency; next_run_at: number } | null;
  next: { amount: number; frequency: SipFrequency; startAt?: number };
}

describe(`contract: ${file.rule} (server)`, () => {
  it("covers every section", () => expectSections(file, ["sipNeedsMpin"]));
  for (const c of casesOf<Input, boolean>(file, "sipNeedsMpin")) it(c.why, () => expect(sipNeedsMpin(c.input.current ?? undefined, c.input.next)).toBe(c.expected));
});
