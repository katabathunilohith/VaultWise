import { body, customer, handle, json, minor } from "@/lib/api";
import { moveToVault, walletView } from "@/lib/wallet";
import { MoveBody } from "../schemas";

/** Wallet → vault. There is no way back: vaults release money only through proof-checked withdrawals. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false, kyc: true });
  const b = await body(req, MoveBody);
  const journalId = moveToVault(user, b.vaultId, minor(b.amount));
  return json({ journalId, wallet: walletView(user) }, { status: 201 });
});
