import { customer, handle, json } from "@/lib/api";
import { all, parseJson } from "@/lib/db";

export const GET = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const url = new URL(req.url);
  const limit = Math.min(500, Number(url.searchParams.get("limit") ?? 200));
  const audit = all<{
    id: number;
    ts: number;
    actor: string;
    actor_type: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    details: string | null;
    hash: string;
  }>(
    "SELECT id, ts, actor, actor_type, action, entity_type, entity_id, details, hash FROM audit_log WHERE user_id = ? ORDER BY id DESC LIMIT ?",
    user.id,
    limit,
  ).map((r) => ({ ...r, details: parseJson(r.details, null) }));
  const journals = all<{ id: string; kind: string; memo: string; created_at: number }>(
    "SELECT id, kind, memo, created_at FROM journals WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    user.id,
    limit,
  ).map((j) => ({
    ...j,
    entries: all<{ account: string; kind: string; amount: number }>(
      "SELECT a.name AS account, a.kind, e.amount FROM ledger_entries e JOIN accounts a ON a.id = e.account_id WHERE e.journal_id = ? ORDER BY e.id",
      j.id,
    ),
  }));
  return json({ audit, journals, currency: user.currency });
});
