import { customer, handle } from "@/lib/api";
import { all } from "@/lib/db";

function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Contribution and investment summary for the calendar year, formatted for tax prep. */
export const GET = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const year = Number(new URL(req.url).searchParams.get("year") ?? new Date().getFullYear());
  const from = new Date(year, 0, 1).getTime();
  const to = new Date(year + 1, 0, 1).getTime();
  const contributions = all<{ name: string; category: string; total: number; n: number }>(
    `SELECT v.name, v.category, SUM(e.amount) AS total, COUNT(*) AS n FROM ledger_entries e
     JOIN vaults v ON v.account_id = e.account_id
     WHERE v.user_id = ? AND e.amount > 0 AND e.created_at >= ? AND e.created_at < ? GROUP BY v.id`,
    user.id,
    from,
    to,
  );
  const withdrawals = all<{ name: string; total: number; n: number }>(
    `SELECT v.name, -SUM(e.amount) AS total, COUNT(*) AS n FROM ledger_entries e
     JOIN vaults v ON v.account_id = e.account_id
     WHERE v.user_id = ? AND e.amount < 0 AND e.created_at >= ? AND e.created_at < ? GROUP BY v.id`,
    user.id,
    from,
    to,
  );
  const buys = all<{ symbol: string; units: number; amount: number; n: number }>(
    `SELECT symbol, SUM(units) AS units, SUM(amount) AS amount, COUNT(*) AS n FROM orders
     WHERE user_id = ? AND side = 'buy' AND created_at >= ? AND created_at < ? GROUP BY symbol`,
    user.id,
    from,
    to,
  );
  const rows: unknown[][] = [["section", "item", "category", "count", `amount_${user.currency}`, "units"]];
  for (const c of contributions) rows.push(["vault_contributions", c.name, c.category, c.n, (c.total / 100).toFixed(2), ""]);
  for (const w of withdrawals) rows.push(["vault_withdrawals", w.name, "", w.n, (w.total / 100).toFixed(2), ""]);
  for (const b of buys) rows.push(["core_purchases_cost_basis", b.symbol, "", b.n, (b.amount / 100).toFixed(2), b.units.toFixed(6)]);
  rows.push(["satellite", "Paper trading only — no realised gains or losses", "", "", "0.00", ""]);
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  return new Response(csv, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="vaultwise-tax-summary-${year}.csv"` },
  });
});
