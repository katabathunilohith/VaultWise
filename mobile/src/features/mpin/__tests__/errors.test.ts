import { ApiError } from "@/lib/api/errors";
import {
  deviceProblemFor,
  isDeviceUnknown,
  isMpinError,
  MPIN_REQUIRED_TEXT,
  phoneTrust,
  readDeviceError,
  readMpinError,
  UNRECOGNISED_TEXT,
  wrongMpinText,
} from "../errors";

const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);

describe("readMpinError", () => {
  it("reads tries left from the body, then from the message", () => {
    expect(readMpinError(new ApiError("That MPIN isn't right.", 403, "mpin_wrong", { triesLeft: 3 }), NOW)).toEqual({
      kind: "wrong",
      triesLeft: 3,
      message: "Wrong MPIN. 3 tries left.",
    });
    expect(readMpinError(new ApiError("Wrong. 1 try left before money moves are locked.", 403, "mpin_wrong"), NOW)).toMatchObject({ triesLeft: 1 });
    expect(readMpinError(new ApiError("Wrong.", 403, "mpin_wrong"), NOW)).toMatchObject({ triesLeft: null, message: "Wrong MPIN. Try again." });
  });

  it("reads a lock from the body, the message, or a bare 423", () => {
    const until = NOW + 5 * 60_000;
    expect(readMpinError(new ApiError("Locked", 423, "mpin_locked", { lockedUntil: until }), NOW)).toMatchObject({ kind: "locked", lockedUntil: until });
    expect(readMpinError(new ApiError("Money moves are locked for 5 minutes.", 423, "mpin_locked"), NOW)).toMatchObject({ lockedUntil: until });
    expect(readMpinError(new ApiError("Locked", 423), NOW)).toMatchObject({ kind: "locked", lockedUntil: NOW + 60_000 });
  });

  it("reads mpin_required by its code, never by its 401", () => {
    expect(readMpinError(new ApiError("Enter your MPIN", 401, "mpin_required"))).toEqual({ kind: "required", message: MPIN_REQUIRED_TEXT });
    expect(readMpinError(new ApiError("Signed out", 401, "signed_out"))).toBeNull();
  });

  it("says a weak MPIN in the policy's words when the reason is known", () => {
    expect(readMpinError(new ApiError("weak", 400, "mpin_weak", { reason: "sequence" }))).toMatchObject({
      kind: "weak",
      reason: "sequence",
      message: "Your MPIN can't be a straight run like 123456 or 654321.",
    });
    expect(readMpinError(new ApiError("Server words", 400, "mpin_weak"))).toMatchObject({ reason: undefined, message: "Server words" });
  });

  it("ignores anything else", () => {
    expect(readMpinError(new Error("boom"))).toBeNull();
    expect(readMpinError(new ApiError("Nope", 400, "kyc_required"))).toBeNull();
    expect(isMpinError(new ApiError("x", 403, "mpin_wrong"))).toBe(true);
    expect(isMpinError(new ApiError("x", 403, "device_untrusted"))).toBe(false);
  });
});

describe("wrongMpinText", () => {
  it("says the tries left", () => {
    expect(wrongMpinText(2)).toBe("Wrong MPIN. 2 tries left.");
    expect(wrongMpinText(1)).toBe("Wrong MPIN. 1 try left.");
    expect(wrongMpinText(0)).toBe("Wrong MPIN.");
  });
});

describe("phoneTrust", () => {
  it("gives the four states from /me's device", () => {
    expect(phoneTrust(undefined, NOW)).toBeNull();
    expect(phoneTrust({ trusted: true, trustableAt: null }, NOW)).toBe("trusted");
    expect(phoneTrust({ registered: false, trusted: false, trustableAt: NOW + 1000 }, NOW)).toBe("unrecognised");
    expect(phoneTrust({ trusted: false, trustableAt: NOW + 1000 }, NOW)).toBe("cooling");
    expect(phoneTrust({ trusted: false, trustableAt: null }, NOW)).toBe("needs_code");
    // The cool-down has passed but /me still says untrusted: only a code helps now.
    expect(phoneTrust({ trusted: false, trustableAt: NOW - 1 }, NOW)).toBe("needs_code");
    // A trusted phone wins even if the account couldn't register it again.
    expect(phoneTrust({ registered: false, trusted: true, trustableAt: null }, NOW)).toBe("trusted");
  });
});

describe("device answers", () => {
  it("reads device_untrusted with its time", () => {
    const p = readDeviceError(new ApiError("x", 403, "device_untrusted", { trustableAt: NOW + 3_600_000 }), NOW);
    expect(p).toMatchObject({ trustableAt: NOW + 3_600_000, title: "This phone isn't trusted yet" });
    expect(p?.message).toMatch(/^Large amounts can move from it from /);
    expect(readDeviceError(new ApiError("x", 403, "device_untrusted"), NOW)?.message).toMatch(/waiting won't trust it/);
    expect(readDeviceError(new ApiError("x", 403, "mpin_wrong"), NOW)).toBeNull();
  });

  it("swaps in the calm explanation for a phone the account couldn't add", () => {
    const p = readDeviceError(new ApiError("x", 403, "device_untrusted", { trustableAt: null }), NOW)!;
    expect(deviceProblemFor(p, { registered: false, trusted: false, trustableAt: null }, NOW)).toMatchObject({
      unrecognised: true,
      message: UNRECOGNISED_TEXT,
    });
    expect(deviceProblemFor(p, { trusted: false, trustableAt: null }, NOW)).toBe(p);
  });

  it("knows device_unknown", () => {
    expect(isDeviceUnknown(new ApiError("x", 403, "device_unknown"))).toBe(true);
    expect(isDeviceUnknown(new ApiError("x", 403, "device_untrusted"))).toBe(false);
  });
});
