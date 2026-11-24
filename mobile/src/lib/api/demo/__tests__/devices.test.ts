import { codeOf, settle } from "@/test/practice";
import { ApiError } from "../../errors";
import { PRACTICE_PIN } from "../../practice";
import { assertPracticeDeviceCap, devicesDemo, practiceDeviceTools, practiceSecurityMe, practiceTrustableAt, practiceTrusted, PRACTICE_OTP, untrustedCapFor } from "../devices";
import { resetPracticeSlices } from "../persist";

const DAY = 86_400_000;
const START = Date.UTC(2026, 10, 24, 12, 0, 0);
let clock = START;

beforeEach(() => {
  jest.useFakeTimers();
  // Two hours apart per test, so the 5-codes-an-hour limit never carries over.
  clock += 2 * 3_600_000;
  jest.setSystemTime(clock);
  resetPracticeSlices();
});
afterEach(() => jest.useRealTimers());

describe("the untrusted-phone cap", () => {
  it("is USD 50 scaled per currency and rounded to a whole unit, in minor units", () => {
    expect(untrustedCapFor("USD")).toBe(5_000);
    expect(untrustedCapFor("INR")).toBe(400_000);
    expect(untrustedCapFor("EUR")).toBe(4_800); // 47.5 rounds to 48
    expect(untrustedCapFor("GBP")).toBe(4_000);
    expect(untrustedCapFor("SGD")).toBe(6_500);
    expect(untrustedCapFor("XYZ")).toBe(5_000); // unknown currency: as USD
  });

  it("lets a trusted phone move any amount", () => {
    expect(practiceSecurityMe().device).toEqual({ registered: true, trusted: true, trustableAt: null });
    expect(() => assertPracticeDeviceCap(10_000_000)).not.toThrow();
  });

  it("holds a new phone to the cap for 24 hours, saying when it trusts itself", () => {
    practiceDeviceTools.startAsNewPhone();
    const now = Date.now();
    expect(practiceSecurityMe().device).toEqual({ registered: true, trusted: false, trustableAt: now + DAY });
    expect(() => assertPracticeDeviceCap(400_000)).not.toThrow(); // the Practice wallet is INR: exactly the cap is fine
    let err: unknown;
    try {
      assertPracticeDeviceCap(400_001);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 403, code: "device_untrusted", data: { trustableAt: now + DAY } });
    // 24 hours later it trusts itself.
    expect(() => assertPracticeDeviceCap(400_001, now + DAY)).not.toThrow();
  });

  it("never trusts a phone with time once a device was signed out first", async () => {
    practiceDeviceTools.signInElsewhere();
    const other = (await settle(devicesDemo.devices())) as { ok: true; value: { id: string; current: boolean }[] };
    const elsewhere = other.value.find((d) => !d.current)!;
    expect(codeOf(await settle(devicesDemo.revokeDevice(elsewhere.id, PRACTICE_PIN)))).toBe("ok");
    practiceDeviceTools.startAsNewPhone();
    expect(practiceSecurityMe().device).toMatchObject({ trusted: false, trustableAt: null });
    expect(() => assertPracticeDeviceCap(400_001, Date.now() + 30 * DAY)).toThrow(ApiError);
  });
});

describe("practiceTrusted / practiceTrustableAt (the server's isTrusted / trustableAtOf)", () => {
  const base = { firstSeen: START, trustedAt: null, revokedAt: null };
  it.each([
    ["trusted with a code", { ...base, trustedAt: START }, START, true, null],
    ["new, cooling down", base, START + 1000, false, START + DAY],
    ["24 hours on", base, START + DAY, true, null],
    ["signed out", { ...base, trustedAt: START, revokedAt: START + 5 }, START + 10, false, null],
    ["first seen after a sign-out", { ...base, coolsDown: false }, START + 30 * DAY, false, null],
    ["an older save without coolsDown", { ...base, coolsDown: undefined }, START + DAY, true, null],
  ])("%s", (_name, d, now, trusted, trustableAt) => {
    expect(practiceTrusted(d, now)).toBe(trusted);
    expect(practiceTrustableAt(d, now)).toBe(trustableAt);
  });
});

describe("trusting this phone with a code and the MPIN", () => {
  it("needs a verified number first", async () => {
    expect(codeOf(await settle(devicesDemo.sendOtp("device_trust")))).toBe("phone_required");
  });

  it("trusts it after the number, a code and the MPIN, in the server's order", async () => {
    practiceDeviceTools.startAsNewPhone();
    const sent = await settle(devicesDemo.sendOtp("phone_verify", "+91 98765 43210"));
    if (!sent.ok) throw sent.error;
    expect(sent.value).toMatchObject({ sentTo: "+91••••••3210", testCode: PRACTICE_OTP });
    expect(codeOf(await settle(devicesDemo.verifyOtp(sent.value.otpId, "000000")))).toBe("otp_wrong");
    const verified = await settle(devicesDemo.verifyOtp(sent.value.otpId, PRACTICE_OTP));
    if (!verified.ok) throw verified.error;
    // The MPIN is checked before the token, so a missing one leaves the token usable.
    expect(codeOf(await settle(devicesDemo.attachPhone(verified.value.verificationToken)))).toBe("mpin_required");
    expect(codeOf(await settle(devicesDemo.attachPhone(verified.value.verificationToken, PRACTICE_PIN)))).toBe("ok");
    expect(practiceSecurityMe().phone).toEqual({ number: "+91••••••3210", verified: true });

    const code = await settle(devicesDemo.sendOtp("device_trust"));
    if (!code.ok) throw code.error;
    const token = await settle(devicesDemo.verifyOtp(code.value.otpId, PRACTICE_OTP));
    if (!token.ok) throw token.error;
    expect(codeOf(await settle(devicesDemo.trustDevice(token.value.verificationToken, "999999")))).toBe("mpin_wrong");
    expect(codeOf(await settle(devicesDemo.trustDevice(token.value.verificationToken, PRACTICE_PIN)))).toBe("ok");
    expect(practiceSecurityMe().device).toEqual({ registered: true, trusted: true, trustableAt: null });
    // Single use.
    expect(codeOf(await settle(devicesDemo.trustDevice(token.value.verificationToken, PRACTICE_PIN)))).toBe("verification_invalid");
  });

  it("refuses an untrusted phone a reset of the MPIN", async () => {
    practiceDeviceTools.startAsNewPhone();
    expect(codeOf(await settle(devicesDemo.sendOtp("mpin_reset")))).toBe("device_untrusted");
  });
});
