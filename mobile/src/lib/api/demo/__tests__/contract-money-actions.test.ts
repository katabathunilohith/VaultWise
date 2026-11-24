/**
 * The server's money table (tests/contract/vectors/money-actions.json) held against the Practice
 * simulator by behaviour: each money move is called without the MPIN, with the ID unverified, and
 * over the cap on a new phone, and must refuse with mpin_required, kyc_required and
 * device_untrusted exactly when the table says so (and in the server's order: the ID gate first,
 * then the device cap, then the MPIN).
 */
import { casesOf, expectSections, loadVectors } from "@/test/contract";
import { codeOf, settle } from "@/test/practice";
import { PRACTICE_PIN } from "../../practice";
import { devicesDemo, practiceDeviceTools } from "../devices";
import { emergencyApi } from "../emergency";
import { demo } from "../index";
import { investApi } from "../invest";
import { changePracticeMpin, resetPracticeMpin } from "../mpin";
import { resetPracticeSlices } from "../persist";
import { S } from "../state";
import { vaultsApi } from "../vaults";
import { walletDemo } from "../wallet";

const file = loadVectors("money-actions");
type Expected = { mpin: boolean; kyc: boolean; deviceCap: boolean; moneyIn: boolean };
const cases = casesOf<{ action: string }, Expected>(file, "actions");

/** "small" stays under the untrusted-phone cap (₹4,000 in Practice); "big" goes over it. */
type Size = "small" | "big";
type Call = (pin: string | undefined, size: Size) => Promise<unknown>;

const major = (size: Size) => (size === "big" ? 5_000 : 100);
const firstVault = () => S.vaults[0].id;

/** How Practice performs each action. A new action in the table fails below until it's added here (or exempted). */
const PRACTICE: Record<string, Call> = {
  withdraw: (pin, size) => vaultsApi.withdraw(firstVault(), major(size), "City Clinic", undefined, pin),
  wallet_spend: (pin, size) => walletDemo.walletSpend(major(size), "Corner Café", null, pin),
  wallet_cash_out: (pin, size) => walletDemo.walletCashOut(major(size), pin),
  wallet_move: (pin, size) => walletDemo.walletMove(firstVault(), major(size), pin),
  wallet_limit_raise: (pin) => {
    S.wallet.dailyLimit = 100_000;
    S.wallet.limitRaisedAt = null;
    return walletDemo.walletSettings({ dailyLimit: 5_000, pin });
  },
  emergency: (pin, size) => emergencyApi.emergencyWithdraw({ amount: major(size), reasonCode: "medical", attest: true, pin }),
  limits_loosen: (pin) => vaultsApi.setLimits({ singleWithdrawal: (S.limits.limits.singleWithdrawal + 100_000) / 100 }, pin),
  invest_buy: (pin, size) => investApi.buyCore(major(size), pin),
  invest_sip: (pin) => investApi.setSip(30_000, "monthly", pin), // above the snapshot's ₹24,000 a month
  satellite_opt_in: (pin) => investApi.satelliteOptIn(100, 4, pin),
  mpin_change: async (pin) => changePracticeMpin(pin ?? "", "482916"),
  device_trust: (pin) => devicesDemo.trustDevice("vtok_contract", pin),
  device_revoke: (pin) => devicesDemo.revokeDevice("dev_contract", pin),
  phone_change: (pin) => devicesDemo.attachPhone("vtok_contract", pin),
  wallet_top_up: (_pin, size) => walletDemo.walletTopUp(major(size)),
  vault_deposit: (_pin, size) => vaultsApi.deposit(firstVault(), major(size)),
  bank_simulate: () => demo.simulate(),
  roundup_sweep: () => demo.sweep(),
};

/** Actions Practice doesn't hold to the table, and why. Keep this short. */
const EXEMPT: Record<string, string> = {
  // The server asks for it only with sign-in on (firebase mode); Practice is a server without sign-in.
  close_account: "Practice has no sign-in, like a server in prototype mode, so Delete account there needs no MPIN",
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(Date.UTC(2026, 10, 24, 12, 0, 0));
  resetPracticeSlices();
  // "Start over" keeps a changed MPIN; put the Practice one back.
  resetPracticeMpin(PRACTICE_PIN);
});
afterEach(() => jest.useRealTimers());

describe(`contract: ${file.rule} (phone, Practice)`, () => {
  it("covers every section", () => expectSections(file, ["actions"]));

  it("knows how to perform every action in the table, or says why not", () => {
    const listed = cases.map((c) => c.input.action).sort();
    expect([...Object.keys(PRACTICE), ...Object.keys(EXEMPT)].sort()).toEqual(listed);
    for (const a of Object.keys(EXEMPT)) expect(PRACTICE[a]).toBeUndefined();
  });

  for (const c of cases) {
    const call = PRACTICE[c.input.action];
    if (!call) continue;
    const { mpin, kyc, deviceCap } = c.expected;

    describe(c.input.action, () => {
      it(mpin ? "refuses without the MPIN (mpin_required)" : "goes through without an MPIN", async () => {
        const code = codeOf(await settle(call(undefined, "small")));
        if (mpin) expect(code).toBe("mpin_required");
        else expect(code).toBe("ok");
      });

      it(kyc ? "needs a verified ID first (kyc_required, before the MPIN)" : "doesn't need a verified ID", async () => {
        S.identity.kyc = { ...S.identity.kyc, status: "rejected" };
        const code = codeOf(await settle(call(undefined, "small")));
        if (kyc) expect(code).toBe("kyc_required");
        else expect(code).toBe(mpin ? "mpin_required" : "ok");
      });

      it(deviceCap ? "holds a new phone to the cap (device_untrusted, before the MPIN)" : "isn't held to the untrusted-phone cap", async () => {
        practiceDeviceTools.startAsNewPhone();
        const code = codeOf(await settle(call(undefined, "big")));
        if (deviceCap) expect(code).toBe("device_untrusted");
        else expect(code).toBe(mpin ? "mpin_required" : "ok");
      });
    });
  }

  for (const [action, why] of Object.entries(EXEMPT)) it.skip(`${action}: not simulated (${why})`, () => undefined);
});
