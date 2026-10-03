import { all, get, newId, run, tx } from "./db";
import { audit, type ActorType } from "./audit";

/**
 * Double-entry ledger. Every money movement is a journal whose entries sum to
 * zero; ledger_entries is append-only (enforced by DB triggers) and is the
 * source of truth. `balances` is a projection kept in the same transaction and
 * reconciled against a full replay in the ops console.
 *
 * Sign convention: positive = debit (asset increases), negative = credit.
 */

export type AccountKind =
  | "bank" // user's linked external bank account (simulated open-banking rail)
  | "vault"
  | "core_cash"
  | "core_securities"
  | "satellite_cash"
  | "world" // external counterparty: employers, merchants, payees
  | "fees";

const NON_NEGATIVE: AccountKind[] = ["bank", "vault", "core_cash", "core_securities", "satellite_cash"];

export interface Account {
  id: string;
  user_id: string | null;
  kind: AccountKind;
  name: string;
  currency: string;
  ref_id: string | null;
  created_at: number;
}

export class LedgerError extends Error {
  status = 400;
}

export function ensureAccount(opts: { userId: string | null; kind: AccountKind; name: string; currency: string; refId?: string }): Account {
  const existing = opts.refId
    ? get<Account>("SELECT * FROM accounts WHERE kind = ? AND ref_id = ?", opts.kind, opts.refId)
    : get<Account>("SELECT * FROM accounts WHERE kind = ? AND currency = ? AND user_id IS ?", opts.kind, opts.currency, opts.userId);
  if (existing) return existing;
  const acct: Account = {
    id: newId("acc"),
    user_id: opts.userId,
    kind: opts.kind,
    name: opts.name,
    currency: opts.currency,
    ref_id: opts.refId ?? null,
    created_at: Date.now(),
  };
  run(
    "INSERT INTO accounts (id, user_id, kind, name, currency, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    acct.id,
    acct.user_id,
    acct.kind,
    acct.name,
    acct.currency,
    acct.ref_id,
    acct.created_at,
  );
  run("INSERT INTO balances (account_id, balance, version, updated_at) VALUES (?, 0, 0, ?)", acct.id, acct.created_at);
  return acct;
}

export const worldAccount = (currency: string) =>
  ensureAccount({ userId: null, kind: "world", name: `External counterparties (${currency})`, currency });

export const userAccount = (userId: string, kind: Exclude<AccountKind, "vault" | "world">, currency: string) =>
  ensureAccount({
    userId,
    kind,
    currency,
    name: {
      bank: "Linked bank account",
      core_cash: "Core sleeve cash",
      core_securities: "Core sleeve securities (at cost)",
      satellite_cash: "Satellite sleeve allocation",
      fees: "Platform fees",
    }[kind],
  });

export function balanceOf(accountId: string): number {
  return get<{ balance: number }>("SELECT balance FROM balances WHERE account_id = ?", accountId)?.balance ?? 0;
}

export interface PostInput {
  userId: string | null;
  kind: string;
  memo: string;
  refType?: string;
  refId?: string;
  entries: { accountId: string; amount: number }[];
  ts?: number;
  actor?: string;
  actorType?: ActorType;
}

export function post(input: PostInput): string {
  return tx(() => {
    if (input.entries.length < 2) throw new LedgerError("A journal needs at least two entries");
    const sum = input.entries.reduce((s, e) => s + e.amount, 0);
    if (sum !== 0) throw new LedgerError(`Unbalanced journal (sum ${sum})`);
    if (input.entries.some((e) => !Number.isInteger(e.amount))) throw new LedgerError("Amounts must be integer minor units");

    const accounts = input.entries.map((e) => {
      const a = get<Account>("SELECT * FROM accounts WHERE id = ?", e.accountId);
      if (!a) throw new LedgerError(`Unknown account ${e.accountId}`);
      return a;
    });
    const currency = accounts[0].currency;
    if (accounts.some((a) => a.currency !== currency)) throw new LedgerError("Cross-currency journals need an FX leg");

    const ts = input.ts ?? Date.now();
    const journalId = newId("jnl");
    run(
      "INSERT INTO journals (id, user_id, kind, memo, ref_type, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      journalId,
      input.userId,
      input.kind,
      input.memo,
      input.refType ?? null,
      input.refId ?? null,
      ts,
    );
    input.entries.forEach((e, i) => {
      const acct = accounts[i];
      run(
        "INSERT INTO ledger_entries (journal_id, account_id, amount, currency, created_at) VALUES (?, ?, ?, ?, ?)",
        journalId,
        e.accountId,
        e.amount,
        currency,
        ts,
      );
      run("UPDATE balances SET balance = balance + ?, version = version + 1, updated_at = ? WHERE account_id = ?", e.amount, ts, e.accountId);
      if (NON_NEGATIVE.includes(acct.kind) && balanceOf(e.accountId) < 0) {
        throw new LedgerError(`Insufficient funds in ${acct.name}`);
      }
    });
    audit({
      userId: input.userId,
      actor: input.actor ?? "ledger",
      actorType: input.actorType ?? "system",
      action: `ledger.${input.kind}`,
      entityType: "journal",
      entityId: journalId,
      details: { memo: input.memo, entries: input.entries, currency },
      ts,
    });
    return journalId;
  });
}

export function transfer(opts: {
  userId: string;
  from: string;
  to: string;
  amount: number;
  kind: string;
  memo: string;
  refType?: string;
  refId?: string;
  ts?: number;
  actor?: string;
  actorType?: ActorType;
}) {
  if (opts.amount <= 0) throw new LedgerError("Amount must be positive");
  return post({
    userId: opts.userId,
    kind: opts.kind,
    memo: opts.memo,
    refType: opts.refType,
    refId: opts.refId,
    ts: opts.ts,
    actor: opts.actor,
    actorType: opts.actorType,
    entries: [
      { accountId: opts.from, amount: -opts.amount },
      { accountId: opts.to, amount: opts.amount },
    ],
  });
}

export interface JournalLine {
  journal_id: string;
  kind: string;
  memo: string;
  created_at: number;
  amount: number;
  currency: string;
  ref_type: string | null;
  ref_id: string | null;
}

export function accountHistory(accountId: string, limit = 50): JournalLine[] {
  return all<JournalLine>(
    `SELECT j.id AS journal_id, j.kind, j.memo, j.created_at, e.amount, e.currency, j.ref_type, j.ref_id
     FROM ledger_entries e JOIN journals j ON j.id = e.journal_id
     WHERE e.account_id = ? ORDER BY e.created_at DESC, e.id DESC LIMIT ?`,
    accountId,
    limit,
  );
}

/** Replays the ledger and compares it with the projection and with itself. */
export function reconcile() {
  const unbalanced = all<{ journal_id: string; total: number }>(
    "SELECT journal_id, SUM(amount) AS total FROM ledger_entries GROUP BY journal_id HAVING SUM(amount) != 0",
  );
  const byCurrency = all<{ currency: string; total: number; entries: number }>(
    "SELECT currency, SUM(amount) AS total, COUNT(*) AS entries FROM ledger_entries GROUP BY currency",
  );
  const drift = all<{ account_id: string; name: string; projected: number; replayed: number }>(
    `SELECT a.id AS account_id, a.name, b.balance AS projected, COALESCE(SUM(e.amount), 0) AS replayed
     FROM accounts a
     JOIN balances b ON b.account_id = a.id
     LEFT JOIN ledger_entries e ON e.account_id = a.id
     GROUP BY a.id HAVING projected != replayed`,
  );
  const trial = all<{ kind: string; currency: string; total: number; accounts: number }>(
    `SELECT a.kind, a.currency, SUM(b.balance) AS total, COUNT(*) AS accounts
     FROM accounts a JOIN balances b ON b.account_id = a.id GROUP BY a.kind, a.currency ORDER BY a.kind`,
  );
  const journals = get<{ n: number }>("SELECT COUNT(*) AS n FROM journals")?.n ?? 0;
  return {
    ok: unbalanced.length === 0 && drift.length === 0 && byCurrency.every((c) => c.total === 0),
    journals,
    unbalanced,
    byCurrency,
    drift,
    trial,
    checkedAt: Date.now(),
  };
}
