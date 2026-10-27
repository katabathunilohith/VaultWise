/**
 * Wallet: a spending balance inside the app. Money comes in from the bank, goes out to vaults,
 * payees or back to the bank, and can feed auto-saves. See README.md for the switch and every
 * touch point outside this folder (marked `// wallet`).
 */
export { walletEnabled, assertWalletEnabled, WalletError } from "./config";
export { type AutoSaveSource, type WalletSettings, walletSettings } from "./store";
export {
  DAY_MS,
  RAISE_WINDOW_MS,
  DEFAULT_PAY_GAP_MS,
  dayStart,
  paydayEstimate,
  upcomingFromWallet,
  spentOn,
  limitState,
  safeToSpend,
  type Payday,
  type LimitState,
} from "./plan";
export {
  walletAccount,
  topUp,
  moveToVault,
  spend,
  cashOut,
  updateWalletSettings,
  autoSaveSource,
  runDueWalletContributions,
} from "./moves";
export { walletView, walletActivity, type WalletView, type WalletActivity, type WalletActivityKind } from "./view";
