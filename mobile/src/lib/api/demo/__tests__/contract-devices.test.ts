import { casesOf, expectSections, loadVectors } from "@/test/contract";
import { practiceTrustableAt, practiceTrusted, untrustedCapFor } from "../devices";

const cap = loadVectors("untrusted-cap");
const trust = loadVectors("device-trust");

interface DeviceInput {
  firstSeen: number;
  trustedAt: number | null;
  revokedAt: number | null;
  coolsDown?: boolean;
}

describe(`contract: ${cap.rule} (phone)`, () => {
  it("covers every section", () => expectSections(cap, ["untrustedCap"]));
  for (const c of casesOf<{ currency: string }, number>(cap, "untrustedCap")) it(c.why, () => expect(untrustedCapFor(c.input.currency)).toBe(c.expected));
});

describe(`contract: ${trust.rule} (phone)`, () => {
  it("covers every section", () => expectSections(trust, ["trust"]));
  for (const c of casesOf<{ device: DeviceInput; now: number }, { trusted: boolean; trustableAt: number | null }>(trust, "trust"))
    it(c.why, () =>
      expect({ trusted: practiceTrusted(c.input.device, c.input.now), trustableAt: practiceTrustableAt(c.input.device, c.input.now) }).toEqual(c.expected),
    );
});
