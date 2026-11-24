import { birthDateAsPin, checkNewMpin, COMMON_MPINS, lockMsAfter, MPIN_LOCK_STEPS_MS, MPIN_TRIES_PER_LOCK, triesLeftAfter, waitText, weakMpinMessage } from "../policy";

describe("checkNewMpin", () => {
  it("accepts an ordinary 6-digit MPIN", () => {
    expect(checkNewMpin("482916")).toEqual({ ok: true });
  });

  it.each([
    ["", "length"],
    ["12345", "length"],
    ["1234567", "length"],
    ["12a456", "length"],
    ["111111", "repeated"],
    ["000000", "repeated"],
    ["123456", "sequence"],
    ["654321", "sequence"],
    ["567890", "sequence"],
    ["109876", "sequence"],
    ["121212", "common"],
    ["147258", "common"],
  ])("refuses %j (%s)", (pin, reason) => {
    const r = checkNewMpin(pin);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe(reason);
      expect(r.message).toBe(weakMpinMessage(reason));
    }
  });

  it("refuses the date of birth as DDMMYY, only when it is known", () => {
    expect(checkNewMpin("150394", { dob: "1994-03-15" })).toMatchObject({ ok: false, reason: "birth_date" });
    expect(checkNewMpin("150394")).toEqual({ ok: true });
    expect(checkNewMpin("150394", { dob: null })).toEqual({ ok: true });
  });

  it("checks the length before anything else", () => {
    expect(checkNewMpin("11111")).toMatchObject({ reason: "length" });
  });

  it("lists only 6-digit PINs the rules don't already catch", () => {
    for (const pin of COMMON_MPINS) {
      expect(pin).toMatch(/^\d{6}$/);
      expect(checkNewMpin(pin)).toMatchObject({ ok: false, reason: "common" });
    }
  });
});

describe("birthDateAsPin", () => {
  it("turns YYYY-MM-DD into DDMMYY", () => {
    expect(birthDateAsPin("2001-12-09")).toBe("091201");
    expect(birthDateAsPin("2001-12-09T00:00:00Z")).toBe("091201");
  });
  it("is null for anything that isn't a date", () => {
    expect(birthDateAsPin(undefined)).toBeNull();
    expect(birthDateAsPin("09/12/2001")).toBeNull();
  });
});

describe("the lock", () => {
  it("locks on every 5th wrong try, with growing steps that stop at 24 hours", () => {
    expect(MPIN_TRIES_PER_LOCK).toBe(5);
    expect([1, 2, 3, 4].map(lockMsAfter)).toEqual([null, null, null, null]);
    expect(lockMsAfter(5)).toBe(MPIN_LOCK_STEPS_MS[0]);
    expect(lockMsAfter(10)).toBe(5 * 60_000);
    expect(lockMsAfter(15)).toBe(30 * 60_000);
    expect(lockMsAfter(20)).toBe(24 * 3_600_000);
    expect(lockMsAfter(40)).toBe(24 * 3_600_000);
    expect(lockMsAfter(0)).toBeNull();
  });

  it("counts tries left before the next lock", () => {
    expect(triesLeftAfter(0)).toBe(5);
    expect(triesLeftAfter(4)).toBe(1);
    expect(triesLeftAfter(5)).toBe(5);
    expect(triesLeftAfter(7)).toBe(3);
  });
});

describe("waitText", () => {
  it("rounds up to the unit the server uses", () => {
    expect(waitText(0)).toBe("1 second");
    expect(waitText(45_000)).toBe("45 seconds");
    expect(waitText(60_000)).toBe("1 minute");
    expect(waitText(61_000)).toBe("2 minutes");
    expect(waitText(30 * 60_000)).toBe("30 minutes");
    expect(waitText(24 * 3_600_000)).toBe("24 hours");
  });
});

describe("weakMpinMessage", () => {
  it("falls back to the common-PIN wording for a reason it doesn't know", () => {
    expect(weakMpinMessage("nope")).toBe(weakMpinMessage("common"));
    expect(weakMpinMessage(undefined)).toBe(weakMpinMessage("common"));
  });
});
