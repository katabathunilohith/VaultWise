import { HttpError } from "../users";

/**
 * The wallet's one switch. The wallet is on unless the server has `WALLET_ENABLED=false`.
 *
 * Switched off: no new top-ups, moves or spends, settings can't change, and auto-saves draw from the
 * bank again whatever the customer chose. Reading the wallet and cashing out still work, so money
 * already in a wallet is never stuck.
 */
export function walletEnabled() {
  return process.env.WALLET_ENABLED !== "false";
}

/**
 * An HttpError with a machine-readable code, for clients that branch on it. (The field has an
 * initializer so it stays valid if HttpError gains its own optional `code`.)
 */
export class WalletError extends HttpError {
  code: string = "";
  constructor(status: number, message: string, code: string) {
    super(status, message);
    this.code = code;
  }
}

export function assertWalletEnabled() {
  if (!walletEnabled()) throw new WalletError(404, "The wallet is switched off.", "wallet_off");
}
