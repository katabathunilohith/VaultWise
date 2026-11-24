import { body, customer, handle, json, minor } from "@/lib/api";
import { cashOut, walletView } from "@/lib/wallet";
import { mpinField, requireMpin } from "@/lib/mpin"; // mpin
import { assertDeviceMayMove } from "@/lib/devices"; // devices
import { CashOutBody } from "../schemas";

/** Wallet → bank. Counts toward the daily limit. Still works with the wallet switched off. Needs the MPIN. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false, money: "wallet_cash_out" });
  const b = await body(req, CashOutBody.extend({ pin: mpinField }));
  await assertDeviceMayMove(user, minor(b.amount), "wallet_cash_out"); // devices: a new device may only move a little
  requireMpin(user, b.pin, "wallet_cash_out"); // mpin
  const journalId = cashOut(user, minor(b.amount));
  return json({ journalId, wallet: walletView(user) }, { status: 201 });
});
