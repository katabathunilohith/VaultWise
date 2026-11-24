import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { markRead, unreadCount } from "@/lib/alerts";

/** Marks alerts read: `{ ids?: string[] }`; no `ids` marks them all. Answers `{ ok: true, unread }`. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ ids: z.array(z.string().min(1).max(64)).max(200).optional() }));
  markRead(user.id, b.ids);
  return json({ ok: true, unread: unreadCount(user.id) });
});
