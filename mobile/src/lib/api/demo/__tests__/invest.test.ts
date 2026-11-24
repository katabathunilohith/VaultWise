import { codeOf, settle } from "@/test/practice";
import { ApiError } from "../../errors";
import { PRACTICE_PIN } from "../../practice";
import { investApi } from "../invest";
import { resetPracticeSlices } from "../persist";
import { S } from "../state";

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(Date.UTC(2026, 10, 24, 12, 0, 0));
  resetPracticeSlices();
});
afterEach(() => jest.useRealTimers());

const activeSip = async () => {
  const core = await settle(investApi.investCore());
  if (!core.ok) throw core.error;
  return core.value.sips.find((s) => s.active === 1) ?? null;
};

describe("Core plan (invest_sip) in Practice", () => {
  it("starts from the snapshot's ₹24,000 monthly plan", async () => {
    expect(await activeSip()).toMatchObject({ amount: 2_400_000, frequency: "monthly" });
  });

  it("needs the MPIN to raise the plan, and saves it with the right one", async () => {
    expect(codeOf(await settle(investApi.setSip(30_000, "monthly")))).toBe("mpin_required");
    expect(codeOf(await settle(investApi.setSip(30_000, "monthly", "000000")))).toBe("mpin_wrong");
    expect(await activeSip()).toMatchObject({ amount: 2_400_000 });
    expect(codeOf(await settle(investApi.setSip(30_000, "monthly", PRACTICE_PIN)))).toBe("ok");
    expect(await activeSip()).toMatchObject({ amount: 3_000_000, frequency: "monthly" });
  });

  it("lowers it without the MPIN, but not when weekly makes it more a month", async () => {
    expect(codeOf(await settle(investApi.setSip(10_000, "monthly")))).toBe("ok");
    expect(await activeSip()).toMatchObject({ amount: 1_000_000 });
    expect(codeOf(await settle(investApi.setSip(10_000, "weekly")))).toBe("mpin_required");
    expect(codeOf(await settle(investApi.setSip(2_000, "weekly")))).toBe("ok"); // about ₹8,667 a month
  });

  it("stops it without the MPIN; starting again needs it", async () => {
    expect(codeOf(await settle(investApi.cancelSip()))).toBe("ok");
    expect(await activeSip()).toBeNull();
    expect(codeOf(await settle(investApi.setSip(100, "monthly")))).toBe("mpin_required");
    expect(codeOf(await settle(investApi.setSip(100, "monthly", PRACTICE_PIN)))).toBe("ok");
  });

  it("refuses a bad amount before asking for the MPIN, and needs a verified ID first", async () => {
    expect(codeOf(await settle(investApi.setSip(0, "monthly")))).toBe("http_400");
    S.identity.kyc = { ...S.identity.kyc, status: "rejected" };
    expect(codeOf(await settle(investApi.setSip(30_000, "monthly", PRACTICE_PIN)))).toBe("kyc_required");
  });
});

describe("Satellite allocations (satellite_opt_in) in Practice", () => {
  const eligibility = async () => {
    const sat = await settle(investApi.investSatellite());
    if (!sat.ok) throw sat.error;
    return sat.value.eligibility as { capAmount: number; allocated: number; headroom: number };
  };

  it("works out the cap from the Core holdings, as the server does", async () => {
    expect(await eligibility()).toMatchObject({ capAmount: 2_054_910, allocated: 1_760_000, headroom: 294_910 });
  });

  it("needs the MPIN for every allocation, before its own checks", async () => {
    expect(codeOf(await settle(investApi.satelliteOptIn(1_000, 4)))).toBe("mpin_required");
    // Not every disclosure confirmed: refused, but only once the MPIN is right.
    const unread = await settle(investApi.satelliteOptIn(1_000, 3, PRACTICE_PIN));
    expect(unread.ok ? null : (unread.error as ApiError).message).toBe("Please acknowledge every risk disclosure");
    const over = await settle(investApi.satelliteOptIn(3_000, 4, PRACTICE_PIN));
    expect(over.ok ? null : (over.error as ApiError).message).toBe("Allocation is capped at 10% of your investments");
  });

  it("moves the money from the bank and shows it everywhere", async () => {
    const bank = S.totals.bank;
    expect(codeOf(await settle(investApi.satelliteOptIn(1_000, 4, PRACTICE_PIN)))).toBe("ok");
    expect(S.totals.bank).toBe(bank - 100_000);
    expect(await eligibility()).toMatchObject({ allocated: 1_860_000, headroom: 194_910 });
    const pf = await settle(investApi.portfolio());
    if (!pf.ok) throw pf.error;
    expect(pf.value.satellite).toMatchObject({ optedIn: true, allocated: 1_860_000 });
  });

  it("needs a verified ID first", async () => {
    S.identity.kyc = { ...S.identity.kyc, status: "rejected" };
    expect(codeOf(await settle(investApi.satelliteOptIn(1_000, 4, PRACTICE_PIN)))).toBe("kyc_required");
  });
});
