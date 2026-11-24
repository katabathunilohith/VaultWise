import { customer, handle, json, limitParam } from "@/lib/api";
import { alertView, listAlerts, unreadCount } from "@/lib/alerts";

/**
 * The person's alerts, newest first: `{ alerts: [{ id, kind, title, body, createdAt, readAt }], unread }`.
 * `?unread=1` lists only unread ones; `?limit=` (default 50, at most 200).
 */
export const GET = handle(async (req: Request) => {
  const user = await customer({ tick: false, access: "read" });
  const url = new URL(req.url);
  const unreadOnly = ["1", "true"].includes(url.searchParams.get("unread") ?? "");
  const alerts = listAlerts(user.id, { unreadOnly, limit: limitParam(url, 50, 200) });
  return json({ alerts: alerts.map(alertView), unread: unreadCount(user.id) });
});
