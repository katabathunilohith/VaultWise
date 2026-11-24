import { body, customer, handle, json, minor } from "@/lib/api";
import { moveToVault, walletView } from "@/lib/wallet";
import { mpinField, requireMpin } from "@/lib/mpin"; // mpin
import { MoveBody } from "../schemas";

/** Wallet → vault. There is no way back: vaults release money only through proof-checked withdrawals. Needs the MPIN. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false, money: "wallet_move" });
  const b = await body(req, MoveBody.extend({ pin: mpinField }));
  requireMpin(user, b.pin, "wallet_move"); // mpin
  const journalId = moveToVault(user, b.vaultId, minor(b.amount));
  return json({ journalId, wallet: walletView(user) }, { status: 201 });
});
