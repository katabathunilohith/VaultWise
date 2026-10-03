import { handle, json } from "@/lib/api";
import { destroyDatabase } from "@/lib/db";

export const POST = handle(async () => {
  destroyDatabase();
  return json({ ok: true });
});
