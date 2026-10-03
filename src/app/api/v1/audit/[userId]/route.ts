import { handle, json } from "@/lib/api";
import { all, parseJson } from "@/lib/db";
import { verifyAuditChain } from "@/lib/audit";

type Ctx = { params: Promise<{ userId: string }> };

/** Immutable activity log for a user (admin-scoped). Use "all" for the global log. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { userId } = await ctx.params;
  const url = new URL(req.url);
  const limit = Math.min(1000, Number(url.searchParams.get("limit") ?? 300));
  const action = url.searchParams.get("action");
  const rows = all<{
    id: number;
    ts: number;
    user_id: string | null;
    actor: string;
    actor_type: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    details: string | null;
    prev_hash: string;
    hash: string;
  }>(
    `SELECT * FROM audit_log WHERE (? = 'all' OR user_id = ?) AND (? IS NULL OR action LIKE ?) ORDER BY id DESC LIMIT ?`,
    userId,
    userId,
    action,
    action ? `${action}%` : null,
    limit,
  ).map((r) => ({ ...r, details: parseJson(r.details, null) }));
  return json({ rows, chain: verifyAuditChain() });
});
