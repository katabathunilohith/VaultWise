import { all, get, run } from "../db";

/**
 * Satellite strategies and their last backtest, one row per customer and strategy (B9): a customer's backtest
 * never overwrites another's, and each customer reads only their own. The table is in db.ts (with the
 * migration that split the old shared rows by owner).
 */
export interface StrategyRow {
  user_id: string;
  /** The strategy, e.g. `smc:BTC-USD:1h` (`strategyId()` in satellite.ts). */
  id: string;
  name: string;
  params: string;
  stage: string;
  last_backtest: string | null;
  created_at: number;
}

/** One customer's row for a strategy, or undefined when they haven't backtested it. */
export function strategyFor(userId: string, id: string): StrategyRow | undefined {
  return get<StrategyRow>("SELECT * FROM strategies WHERE user_id = ? AND id = ?", userId, id);
}

/** Records a customer's backtest of a strategy, replacing only that customer's previous result. */
export function saveStrategyBacktest(
  userId: string,
  s: { id: string; name: string; params: unknown; stage: string; lastBacktest: unknown; now?: number },
) {
  run(
    `INSERT INTO strategies (user_id, id, name, params, stage, last_backtest, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, id) DO UPDATE SET last_backtest = excluded.last_backtest, stage = excluded.stage, params = excluded.params`,
    userId,
    s.id,
    s.name,
    JSON.stringify(s.params),
    s.stage,
    JSON.stringify(s.lastBacktest),
    s.now ?? Date.now(),
  );
}

/** Every customer's strategies, with the customer's name: the reviewer console only. */
export function allStrategies() {
  return all<Pick<StrategyRow, "user_id" | "id" | "name" | "stage" | "last_backtest"> & { customer: string | null }>(
    `SELECT s.user_id, s.id, s.name, s.stage, s.last_backtest, u.name AS customer
     FROM strategies s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.id, s.user_id`,
  );
}
