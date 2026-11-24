import { body, customer, handle, json, minor } from "@/lib/api";
import { spend, walletView } from "@/lib/wallet";
import { mpinField, requireMpin } from "@/lib/mpin"; // mpin
import { assertDeviceMayMove } from "@/lib/devices"; // devices
import { SpendBody } from "../schemas";

/** Wallet → a payee. Counts toward the daily limit. Needs the MPIN. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false, money: "wallet_spend" });
  const b = await body(req, SpendBody.extend({ pin: mpinField }));
  await assertDeviceMayMove(user, minor(b.amount), "wallet_spend"); // devices: a new device may only move a little
  requireMpin(user, b.pin, "wallet_spend"); // mpin
  const journalId = spend(user, { amount: minor(b.amount), payee: b.payee, note: b.note ?? null });
  return json({ journalId, wallet: walletView(user) }, { status: 201 });
});
