import { describe, expect, it } from "vitest";
import { isTrusted, trustableAtOf, untrustedMoveCap } from "@/lib/devices";
import { casesOf, expectSections, loadVectors } from "./vectors";

const cap = loadVectors("untrusted-cap");
const trust = loadVectors("device-trust");

interface DeviceInput {
  firstSeen: number;
  trustedAt: number | null;
  revokedAt: number | null;
  coolsDown?: boolean;
}

describe(`contract: ${cap.rule} (server)`, () => {
  it("covers every section", () => expectSections(cap, ["untrustedCap"]));
  for (const c of casesOf<{ currency: string }, number>(cap, "untrustedCap")) it(c.why, () => expect(untrustedMoveCap({ currency: c.input.currency })).toBe(c.expected));
});

describe(`contract: ${trust.rule} (server)`, () => {
  it("covers every section", () => expectSections(trust, ["trust"]));
  for (const c of casesOf<{ device: DeviceInput; now: number }, { trusted: boolean; trustableAt: number | null }>(trust, "trust"))
    it(c.why, () =>
      expect({ trusted: isTrusted(c.input.device, c.input.now), trustableAt: trustableAtOf(c.input.device, c.input.now) }).toEqual(c.expected),
    );
});
