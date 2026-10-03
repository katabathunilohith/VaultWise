import { all, get, run } from "./db";
import { aiEnabled, chatJson } from "./groq";
import { rulesFor } from "./compliance";
import { balanceOf, userAccount } from "./ledger";
import { listVaults, pendingRoundups } from "./vaults";
import { CATEGORIES, fmtMoney } from "./shared";
import type { User } from "./users";

function weekIndex(t: number) {
  // Weeks starting Monday.
  return Math.floor((t / 86_400_000 + 3) / 7);
}

export function contributionStreak(user: User) {
  const rows = all<{ t: number }>(
    `SELECT e.created_at AS t FROM ledger_entries e JOIN accounts a ON a.id = e.account_id
     WHERE a.user_id = ? AND a.kind = 'vault' AND e.amount > 0 ORDER BY e.created_at DESC`,
    user.id,
  );
  const weeks = new Set(rows.map((r) => weekIndex(r.t)));
  let cur = weekIndex(Date.now());
  if (!weeks.has(cur)) cur -= 1; // this week isn't over yet
  let streak = 0;
  while (weeks.has(cur)) {
    streak++;
    cur--;
  }
  const best = (() => {
    const sorted = [...weeks].sort((a, b) => a - b);
    let b = 0;
    let run = 0;
    for (let k = 0; k < sorted.length; k++) {
      run = k > 0 && sorted[k] === sorted[k - 1] + 1 ? run + 1 : 1;
      b = Math.max(b, run);
    }
    return b;
  })();
  const last12 = Array.from({ length: 12 }, (_, k) => {
    const w = weekIndex(Date.now()) - 11 + k;
    return { week: w, active: weeks.has(w) };
  });
  return { streak, best, last12 };
}

export function badges(user: User) {
  const vaults = listVaults(user);
  const streak = contributionStreak(user);
  const swept = get<{ n: number }>("SELECT COUNT(*) AS n FROM bank_transactions WHERE user_id = ? AND roundup_status = 'swept'", user.id)!.n;
  const verified = get<{ n: number }>("SELECT COUNT(*) AS n FROM withdrawals WHERE user_id = ? AND status = 'paid'", user.id)!.n;
  const holdings = get<{ n: number }>("SELECT COUNT(*) AS n FROM holdings WHERE user_id = ? AND sleeve = 'core' AND units > 0", user.id)!.n;
  const maxProgress = Math.max(0, ...vaults.map((v) => v.progress));
  const health = vaults.filter((v) => v.category === "health");
  const healthReady = health.some((v) => v.progress >= 0.5);
  const list = [
    { key: "first-vault", label: "First vault", detail: "Created a purpose-locked vault", earned: vaults.length > 0 },
    { key: "quarter", label: "Quarter way", detail: "A vault reached 25% of its goal", earned: maxProgress >= 0.25 },
    { key: "halfway", label: "Halfway there", detail: "A vault reached 50% of its goal", earned: maxProgress >= 0.5 },
    { key: "goal", label: "Goal reached", detail: "A vault hit 100% of its goal", earned: maxProgress >= 1 },
    { key: "streak-4", label: "Four-week streak", detail: "Contributed four weeks in a row", earned: streak.best >= 4 },
    { key: "streak-12", label: "Quarter streak", detail: "Contributed twelve weeks in a row", earned: streak.best >= 12 },
    { key: "roundups", label: "Spare-change saver", detail: "Swept 10+ round-ups into a vault", earned: swept >= 10 },
    { key: "verified", label: "Verified spend", detail: "Completed a proof-verified withdrawal", earned: verified > 0 },
    { key: "health-ready", label: "Health-ready", detail: "Health vault at least half funded", earned: healthReady },
    { key: "family", label: "Family saver", detail: "Saving with someone in a joint vault", earned: vaults.some((v) => v.isJoint) },
    { key: "diversified", label: "Diversified", detail: "Hold 3+ funds in the Core sleeve", earned: holdings >= 3 },
  ];
  return { streak, badges: list, earned: list.filter((b) => b.earned).length };
}

export interface Nudge {
  key: string;
  tone: "info" | "warning" | "good";
  title: string;
  body: string;
  href?: string;
  action?: string;
}

/** Contextual, rule-based nudges — shown at the moment they're useful. */
export function nudges(user: User): Nudge[] {
  const out: Nudge[] = [];
  const vaults = listVaults(user);
  const missed = all<{ entity_id: string; ts: number }>(
    "SELECT entity_id, ts FROM audit_log WHERE user_id = ? AND action = 'contribution.missed' AND ts > ? ORDER BY ts DESC LIMIT 3",
    user.id,
    Date.now() - 14 * 86_400_000,
  );
  for (const m of missed.slice(0, 1)) {
    const v = vaults.find((x) => x.id === m.entity_id);
    if (v)
      out.push({
        key: `missed-${v.id}`,
        tone: "warning",
        title: `A contribution to ${v.name} was missed`,
        body: "Your linked account was short when the scheduled transfer ran. A smaller amount now keeps the habit alive.",
        href: `/vaults/${v.id}`,
        action: "Top up",
      });
  }
  for (const v of vaults) {
    if (v.monthlyNeeded && v.rule.type === "fixed" && v.rule.amount) {
      const perMonth = v.rule.frequency === "weekly" ? v.rule.amount * 4.33 : v.rule.frequency === "biweekly" ? v.rule.amount * 2.17 : v.rule.amount;
      if (v.monthlyNeeded > perMonth * 1.1) {
        out.push({
          key: `behind-${v.id}`,
          tone: "info",
          title: `${v.name} is behind schedule`,
          body: `To reach ${fmtMoney(v.target, user.currency, { decimals: false })} by ${v.targetDate}, you need about ${fmtMoney(v.monthlyNeeded, user.currency, { decimals: false })}/month — your rule saves ${fmtMoney(Math.round(perMonth), user.currency, { decimals: false })}.`,
          href: `/vaults/${v.id}`,
          action: "Adjust rule",
        });
        break;
      }
    }
  }
  const ru = pendingRoundups(user);
  if (ru.s >= 500)
    out.push({
      key: "roundups",
      tone: "good",
      title: `${fmtMoney(ru.s, user.currency)} in round-ups ready`,
      body: `Spare change from ${ru.n} purchases is waiting to be swept into your vault.`,
      href: "/accounts",
      action: "Sweep now",
    });
  const receipts = get<{ n: number; due: number }>(
    "SELECT COUNT(*) AS n, MIN(receipt_due_at) AS due FROM emergency_requests WHERE user_id = ? AND receipt_status IN ('requested', 'overdue')",
    user.id,
  )!;
  if (receipts.n > 0)
    out.push({
      key: "receipt",
      tone: "warning",
      title: "A supporting receipt is requested",
      body: "Your emergency release went through. Uploading the bill keeps your emergency access fast next time.",
      href: "/emergency",
      action: "Upload receipt",
    });
  const health = vaults.find((v) => v.category === "health");
  if (!health)
    out.push({
      key: "health",
      tone: "info",
      title: "Start a Health vault",
      body: "It's the first stop in an emergency — released instantly with one tap, no paperwork.",
      href: "/vaults?new=health",
      action: "Create",
    });
  const bank = balanceOf(userAccount(user.id, "bank", user.currency).id);
  const sip = get("SELECT 1 FROM sip_plans WHERE user_id = ? AND active = 1", user.id);
  if (!sip && user.risk_profile && bank > 100_000)
    out.push({
      key: "sip",
      tone: "info",
      title: "Put idle cash on autopilot",
      body: "A small recurring SIP into your Core portfolio builds the investing habit without timing the market.",
      href: "/invest/core",
      action: "Set up SIP",
    });
  return out.slice(0, 4);
}

export function snapshot(user: User) {
  const vaults = listVaults(user);
  const bank = balanceOf(userAccount(user.id, "bank", user.currency).id);
  const streak = contributionStreak(user);
  const spend30 = get<{ s: number }>(
    "SELECT COALESCE(SUM(amount), 0) AS s FROM bank_transactions WHERE user_id = ? AND direction = 'debit' AND created_at > ?",
    user.id,
    Date.now() - 30 * 86_400_000,
  )!.s;
  const saved30 = get<{ s: number }>(
    `SELECT COALESCE(SUM(e.amount), 0) AS s FROM ledger_entries e JOIN accounts a ON a.id = e.account_id
     WHERE a.user_id = ? AND a.kind = 'vault' AND e.amount > 0 AND e.created_at > ?`,
    user.id,
    Date.now() - 30 * 86_400_000,
  )!.s;
  return {
    name: user.name.split(" ")[0],
    currency: user.currency,
    jurisdiction: rulesFor(user.jurisdiction).name,
    linkedBank: fmtMoney(bank, user.currency),
    savedLast30Days: fmtMoney(saved30, user.currency),
    cardSpendLast30Days: fmtMoney(spend30, user.currency),
    streakWeeks: streak.streak,
    today: new Date().toISOString().slice(0, 10),
    vaults: vaults.map((v) => ({
      name: v.name,
      category: CATEGORIES[v.category].label,
      balance: fmtMoney(v.balance, user.currency),
      target: fmtMoney(v.target, user.currency),
      progressPct: Math.round(v.progress * 100),
      targetDate: v.targetDate,
      monthsLeft: v.targetDate ? Math.max(0, Math.round((new Date(v.targetDate).getTime() - Date.now()) / (30.44 * 86_400_000))) : null,
      neededPerMonthForGoal: v.monthlyNeeded != null ? fmtMoney(v.monthlyNeeded, user.currency) : null,
      contributionRule:
        v.rule.type === "fixed" && v.rule.amount
          ? `${fmtMoney(v.rule.amount, user.currency)} ${v.rule.frequency}`
          : v.rule.type === "percent_income"
            ? `${v.rule.percent}% of each salary credit`
            : v.rule.type === "roundup"
              ? "card round-ups"
              : "manual only",
      heldForPendingWithdrawals: v.held ? fmtMoney(v.held, user.currency) : undefined,
    })),
  };
}

/** One AI-written weekly insight, cached per day. Falls back to a rule-based line. */
export async function weeklyInsight(user: User) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `insight:${user.id}:${day}`;
  const cached = get<{ payload: string }>("SELECT payload FROM ai_cache WHERE key = ?", key);
  if (cached) return JSON.parse(cached.payload) as { headline: string; body: string; tip: string; source: string };
  const snap = snapshot(user);
  let out: { headline: string; body: string; tip: string; source: string };
  try {
    if (!aiEnabled()) throw new Error("ai off");
    const r = await chatJson<{ headline: string; body: string; tip: string }>(
      [
        {
          role: "system",
          content:
            "You write a short, warm weekly savings insight for a purpose-locked savings app. Be specific to the numbers given, encouraging, never preachy. Do not give personalised investment advice or recommend specific securities. JSON keys: headline (max 8 words), body (max 40 words), tip (one practical savings-habit tip, max 25 words).",
        },
        { role: "user", content: JSON.stringify(snap) },
      ],
      { temperature: 0.6, maxTokens: 400 },
    );
    out = { ...r, source: "ai" };
  } catch {
    const top = [...snap.vaults].sort((a, b) => b.progressPct - a.progressPct)[0];
    out = {
      headline: snap.streakWeeks > 1 ? `${snap.streakWeeks}-week saving streak` : "Your savings this month",
      body: `You moved ${snap.savedLast30Days} into your vaults in the last 30 days.${top ? ` ${top.name} is ${top.progressPct}% of the way to its goal.` : ""}`,
      tip: "Automate contributions for the day after payday so saving happens before spending.",
      source: "rules",
    };
  }
  run("INSERT OR REPLACE INTO ai_cache (key, created_at, payload) VALUES (?, ?, ?)", key, Date.now(), JSON.stringify(out));
  return out;
}
