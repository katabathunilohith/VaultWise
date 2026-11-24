/**
 * mpin: the one policy for money routes. Each money action says what it needs; a route opts in
 * with `customer({ money: "<action>" })` (which applies the ID-check gate below) and passes the
 * body's `pin` to `requireMpin(user, pin, "<action>")` from `src/lib/mpin`.
 *
 * Adding a money route: add a line here, then the two calls above. Nothing else changes.
 * devices: an action marked `deviceCap` (money out) also calls `assertDeviceMayMove(user, amountMinor, "<action>")`
 * from `src/lib/devices` next to `requireMpin()`, so an untrusted device can only move a small amount.
 * The KYC column keeps the plan 03 gates for money out (see docs/plans/contracts.md, "Which actions need it").
 *
 * Money in (`moneyIn: true`, security review gap 7) follows one rule: money entering from outside the account (the
 * linked bank) needs a verified ID (the `kyc` gate, subject to KYC_ENFORCED) and no MPIN, so those routes only call
 * `customer({ money })`. Moving money already inside the account (wallet → vault) is `wallet_move`: MPIN and ID, as
 * before. A route that only sometimes takes money from the bank (POST /vaults with `initialDeposit`) applies the
 * gate with `moneyGate(user, "<action>")` from lib/api when it does, before anything is written.
 */
export interface MoneyPolicy {
  /** The route checks the customer's MPIN (subject to the MPIN_ENFORCED switch). */
  mpin: boolean;
  /** The route needs a verified ID (the `kyc: true` gate, subject to KYC_ENFORCED). */
  kyc: boolean;
  /** Where it applies, for people reading this table. */
  route: string;
  /** devices: money out, so an untrusted device may only move up to `untrustedMoveCap` per move (assertDeviceMayMove in lib/devices). */
  deviceCap?: boolean; // devices
  /** Money entering the account from the linked bank: the ID gate only, never the MPIN (see the rule above). */
  moneyIn?: boolean;
}

export const MONEY_ROUTES = {
  withdraw: { mpin: true, kyc: true, deviceCap: true, route: "POST /vaults/{id}/withdrawals" }, // devices: deviceCap
  wallet_spend: { mpin: true, kyc: true, deviceCap: true, route: "POST /wallet/spend" }, // devices: deviceCap
  wallet_cash_out: { mpin: true, kyc: true, deviceCap: true, route: "POST /wallet/cash-out" }, // devices: deviceCap
  wallet_move: { mpin: true, kyc: true, route: "POST /wallet/move" },
  wallet_limit_raise: { mpin: true, kyc: false, route: "PUT /wallet/settings, when raising or removing the daily limit" },
  emergency: { mpin: true, kyc: true, deviceCap: true, route: "POST /emergency/withdrawals (every tier)" }, // devices: deviceCap
  limits_loosen: { mpin: true, kyc: false, route: "PUT /limits when any limit goes up; POST /limits/emergency" },
  invest_buy: { mpin: true, kyc: true, route: "POST /invest/core/buy" },
  invest_sip: {
    mpin: true,
    kyc: true,
    route:
      "POST /invest/core/sip, setting one up or moving more money (sipNeedsMpin in lib/invest); lowering it and pausing it (DELETE) need no MPIN",
  },
  satellite_opt_in: { mpin: true, kyc: true, route: "POST /invest/satellite/opt-in (every allocation from the bank)" },
  close_account: { mpin: true, kyc: false, route: "POST /reset in firebase mode" },
  mpin_change: { mpin: true, kyc: false, route: "POST /mpin (the current MPIN); PATCH /me with a new pin" },
  device_trust: { mpin: true, kyc: false, route: "POST /devices/trust (with a texted code; MPIN always checked)" }, // devices
  device_revoke: { mpin: true, kyc: false, route: "POST /devices/{id}/revoke (MPIN always checked)" }, // devices
  phone_change: { mpin: true, kyc: false, route: "POST /me/phone, adding or replacing the verified number (MPIN always checked)" }, // otp
  // Money in from the linked bank: ID gate, no MPIN.
  wallet_top_up: { mpin: false, kyc: true, moneyIn: true, route: "POST /wallet/top-up (bank → wallet)" },
  vault_deposit: { mpin: false, kyc: true, moneyIn: true, route: "POST /vaults/{id}/deposits; POST /vaults with initialDeposit (bank → vault)" },
  bank_simulate: { mpin: false, kyc: true, moneyIn: true, route: "POST /accounts/simulate (practice salary and card events on the linked bank)" },
  roundup_sweep: { mpin: false, kyc: true, moneyIn: true, route: "POST /accounts/sweep (round-ups, bank → vault)" },
} as const satisfies Record<string, MoneyPolicy>;

export type MoneyAction = keyof typeof MONEY_ROUTES;

export const MONEY_ACTIONS = Object.keys(MONEY_ROUTES) as MoneyAction[];

export function moneyPolicy(action: MoneyAction): MoneyPolicy {
  return MONEY_ROUTES[action];
}
