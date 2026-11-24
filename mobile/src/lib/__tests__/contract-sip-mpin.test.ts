import { casesOf, expectSections, loadVectors } from "@/test/contract";
import { sipNeedsMpin, type PlanFrequency } from "../invest";

const file = loadVectors("sip-mpin");

interface Input {
  current: { amount: number; frequency: PlanFrequency; next_run_at: number } | null;
  next: { amount: number; frequency: PlanFrequency; startAt?: number };
}

describe(`contract: ${file.rule} (phone)`, () => {
  it("covers every section", () => expectSections(file, ["sipNeedsMpin"]));
  for (const c of casesOf<Input, boolean>(file, "sipNeedsMpin")) it(c.why, () => expect(sipNeedsMpin(c.input.current, c.input.next)).toBe(c.expected));
});
