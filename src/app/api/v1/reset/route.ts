import { handle, json } from "@/lib/api";
import { destroyDatabase } from "@/lib/db";
import { authMode } from "@/lib/auth/config"; // identity
import { closeAccount } from "@/lib/auth/account"; // identity
import { resolveCustomer } from "@/lib/auth/session"; // identity

export const POST = handle(async () => {
  // identity: with sign-in on, "reset" closes this person's account (data kept for audit) instead of wiping the server.
  if (authMode() === "firebase") {
    const { user, session } = await resolveCustomer({ access: "write" });
    closeAccount(user, session.token!.uid);
    return json({ ok: true, closed: true });
  }
  destroyDatabase();
  return json({ ok: true });
});
