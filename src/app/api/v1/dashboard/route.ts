import { customer, handle, json } from "@/lib/api";
import { all, get } from "@/lib/db";
import { balanceOf, userAccount } from "@/lib/ledger";
import { listVaults, pendingRoundups } from "@/lib/vaults";
import { emergencyStatus } from "@/lib/emergency";
import { badges, nudges } from "@/lib/engagement";
import { coreHoldings } from "@/lib/invest/core";
import { paperEquity } from "@/lib/invest/satellite";

export const GET = handle(async () => {
  const user = await customer();
  const vaults = listVaults(user);
  const bank = balanceOf(userAccount(user.id, "bank", user.currency).id);
  const saved = vaults.reduce((s, v) => s + v.balance, 0);
  let core = { total: 0, cost: 0, pnl: 0, cash: 0 };
  try {
    const c = await coreHoldings(user);
    core = { total: c.total, cost: c.cost, pnl: c.pnl, cash: c.cash };
  } catch {
    // prices unavailable
  }
  const satellite = paperEquity(user);
  const em = emergencyStatus(user);

  // Weekly vault balances by category over the last ~17 weeks.
  const entries = all<{ t: number; amount: number; category: string }>(
    `SELECT e.created_at AS t, e.amount, v.category FROM ledger_entries e
     JOIN vaults v ON v.account_id = e.account_id WHERE v.user_id = ? ORDER BY e.created_at`,
    user.id,
  );
  const WEEK = 7 * 86_400_000;
  const end = Date.now();
  const start = end - 17 * WEEK;
  const running: Record<string, number> = {};
  const series: Record<string, number | string>[] = [];
  let k = 0;
  for (let t = start; t <= end + 1; t += WEEK) {
    while (k < entries.length && entries[k].t <= t) {
      running[entries[k].category] = (running[entries[k].category] ?? 0) + entries[k].amount;
      k++;
    }
    series.push({ t, ...Object.fromEntries(Object.entries(running).map(([c, v]) => [c, v])) });
  }

  const recent = all<{ id: string; kind: string; memo: string; created_at: number; amount: number }>(
    `SELECT j.id, j.kind, j.memo, j.created_at, MAX(ABS(e.amount)) AS amount
     FROM journals j JOIN ledger_entries e ON e.journal_id = j.id
     WHERE j.user_id = ? AND j.kind NOT IN ('invest_buy')
     GROUP BY j.id ORDER BY j.created_at DESC LIMIT 8`,
    user.id,
  );
  const b = badges(user);
  const reviewPending = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM withdrawals WHERE user_id = ? AND status IN ('verifying', 'in_review', 'appealed')",
    user.id,
  )!.n;
  return json({
    currency: user.currency,
    totals: {
      saved,
      bank,
      invested: core.total + core.cash + satellite.equity,
      netWorth: saved + bank + core.total + core.cash + satellite.equity,
      corePnl: core.pnl,
    },
    vaults,
    series,
    emergency: {
      tier1Available: em.tier1Available,
      tier2Available: em.tier2Available,
      remainingCap: em.remainingCap,
      cap: em.cap,
      receiptsDue: em.history.filter((h) => h.receiptStatus === "requested" || h.receiptStatus === "overdue").length,
    },
    nudges: nudges(user),
    streak: b.streak,
    badges: b.badges,
    roundups: pendingRoundups(user),
    recent,
    reviewPending,
  });
});
