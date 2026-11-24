import { body, customer, handle, json, minor } from "@/lib/api";
import { updateWalletSettings, walletSettings, walletView } from "@/lib/wallet";
import { mpinField, requireMpin } from "@/lib/mpin"; // mpin
import { SettingsBody } from "../schemas";

/**
 * Daily limit and auto-save source. Turning the limit on or lowering it works any time; raising it
 * or turning it off works once per 30 days (409 `limit_raise_locked` otherwise) and needs the MPIN.
 */
export const PUT = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, SettingsBody.extend({ pin: mpinField }));
  const dailyLimit = b.dailyLimit === undefined ? undefined : b.dailyLimit === null ? null : minor(b.dailyLimit);
  // mpin: raising or removing the limit is a money action (the same "raised" test as updateWalletSettings).
  const current = walletSettings(user.id).dailyLimit;
  if (dailyLimit !== undefined && current !== null && (dailyLimit === null || dailyLimit > current)) requireMpin(user, b.pin, "wallet_limit_raise");
  updateWalletSettings(user, { dailyLimit, autoSaveSource: b.autoSaveSource });
  return json({ wallet: walletView(user) });
});
