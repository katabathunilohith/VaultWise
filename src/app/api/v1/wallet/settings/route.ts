import { body, customer, handle, json, minor } from "@/lib/api";
import { updateWalletSettings, walletView } from "@/lib/wallet";
import { SettingsBody } from "../schemas";

/**
 * Daily limit and auto-save source. Turning the limit on or lowering it works any time; raising it
 * or turning it off works once per 30 days (409 `limit_raise_locked` otherwise).
 */
export const PUT = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, SettingsBody);
  updateWalletSettings(user, {
    dailyLimit: b.dailyLimit === undefined ? undefined : b.dailyLimit === null ? null : minor(b.dailyLimit),
    autoSaveSource: b.autoSaveSource,
  });
  return json({ wallet: walletView(user) });
});
