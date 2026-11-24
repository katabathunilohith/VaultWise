/**
 * mpin: the one policy for money routes. Each money action says what it needs; a route opts in
 * with `customer({ money: "<action>" })` (which applies the ID-check gate below) and passes the
 * body's `pin` to `requireMpin(user, pin, "<action>")` from `src/lib/mpin`.
 *
 * Adding a money route: add a line here, then the two calls above. Nothing else changes.
 * devices: an action marked `deviceCap` (money out) also calls `assertDeviceMayMove(user, amountMinor, "<action>")`
 * from `src/lib/devices` next to `requireMpin()`, so an untrusted device can only move a small amount.
 * The KYC column keeps today's gates exactly (see docs/plans/contracts.md, "Which actions need it").
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
  close_account: { mpin: true, kyc: false, route: "POST /reset in firebase mode" },
  mpin_change: { mpin: true, kyc: false, route: "POST /mpin (the current MPIN); PATCH /me with a new pin" },
  device_trust: { mpin: true, kyc: false, route: "POST /devices/trust (with a texted code; MPIN always checked)" }, // devices
  device_revoke: { mpin: true, kyc: false, route: "POST /devices/{id}/revoke (MPIN always checked)" }, // devices
  phone_change: { mpin: true, kyc: false, route: "POST /me/phone, adding or replacing the verified number (MPIN always checked)" }, // otp
} as const satisfies Record<string, MoneyPolicy>;

export type MoneyAction = keyof typeof MONEY_ROUTES;

export const MONEY_ACTIONS = Object.keys(MONEY_ROUTES) as MoneyAction[];

export function moneyPolicy(action: MoneyAction): MoneyPolicy {
  return MONEY_ROUTES[action];
}
