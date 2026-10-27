/**
 * The one switch for the wallet on the phone. Off: Home and Your limits show no wallet, and the
 * wallet screens send people back Home. The server has its own switch (`WALLET_ENABLED=false`),
 * which leaves cashing out working so money in a wallet is never stuck.
 */
export const WALLET_ENABLED = true;
