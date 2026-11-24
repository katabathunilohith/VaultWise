import { handle, json } from "@/lib/api";
import { destroyDatabase } from "@/lib/db";
import { authMode } from "@/lib/auth/config"; // identity
import { closeAccount } from "@/lib/auth/account"; // identity
import { resolveCustomer } from "@/lib/auth/session"; // identity
import { moneyPolicy } from "@/lib/money-routes"; // mpin
import { mpinField, requireMpin } from "@/lib/mpin"; // mpin

/** The optional JSON body: `{ pin }`, the MPIN, needed to close an account. */
async function pinFrom(req: Request): Promise<string | undefined> {
  const raw: unknown = req instanceof Request ? await req.json().catch(() => null) : null;
  const pin = raw && typeof raw === "object" ? (raw as { pin?: unknown }).pin : undefined;
  return mpinField.parse(pin ?? undefined);
}

export const POST = handle(async (req: Request) => {
  // identity: with sign-in on, "reset" closes this person's account (data kept for audit) instead of wiping the server.
  if (authMode() === "firebase") {
    const { user, session } = await resolveCustomer({ access: "write", kyc: moneyPolicy("close_account").kyc });
    requireMpin(user, await pinFrom(req), "close_account"); // mpin: closing the account needs the MPIN
    closeAccount(user, session.token!.uid);
    return json({ ok: true, closed: true });
  }
  destroyDatabase();
  return json({ ok: true });
});
