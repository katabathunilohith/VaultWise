/**
 * protection (plan 04): phone-side protection. App lock on by default with an idle lock, the iOS
 * app-switcher cover, screenshot blocking on sensitive routes, "Hide balances" on Home, the
 * root / jailbreak warning, the escalating wrong-PIN guard's rules and its lockout, and https only
 * in live builds. See README.md in this folder for the switches and how to remove each one.
 *
 * lib/ files read the switches from ./config directly (it has no imports); everything else
 * imports from here.
 */
export { IDLE_LOCK_MS, PROTECTION, SENSITIVE_ROUTES } from "./config";
export { peekBalances, setHideBalances, useBalancesMasked, useHideBalances } from "./balances";
export { HideBalancesButton, MASK, MaskedAmount, MaskedMoneyText, maskedMoney } from "./HiddenAmount";
export { IntegrityBanner } from "./IntegrityBanner";
export { pinLockoutKind, signOutAfterWrongPins, startPracticeOverAfterLockout, type PinLockout } from "./lockout";
export { PIN_TRIES_BEFORE_WAIT, PIN_TRIES_FINAL, pinTriesExhausted, pinTriesLeft, pinWaitAfter } from "./pin-policy";
export { PrivacyCover } from "./PrivacyCover";
export { isSensitiveRoute, routePath } from "./routes";
export { SensitiveRouteGuard } from "./SensitiveRouteGuard";
export { allowedServerAddress } from "./https";
