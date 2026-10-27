import { body, customer, handle, json, minor } from "@/lib/api";
import { spend, walletView } from "@/lib/wallet";
import { SpendBody } from "../schemas";

/** Wallet → a payee. Counts toward the daily limit. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false, kyc: true });
  const b = await body(req, SpendBody);
  const journalId = spend(user, { amount: minor(b.amount), payee: b.payee, note: b.note ?? null });
  return json({ journalId, wallet: walletView(user) }, { status: 201 });
});
