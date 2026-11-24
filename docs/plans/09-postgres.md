# 09. Move to PostgreSQL

**Status:** later · **Owner:** Claude · **Size:** L

## Goal

Move from SQLite to PostgreSQL when Vaultwise needs more than one server, or a managed database with point-in-time recovery. Until then SQLite on one server is fine for hundreds of users. The team agreed to keep SQLite for now.

## When to start

Any one of these:
- you need two or more app servers, for uptime or load;
- the database file passes a few GB, or writes start waiting on each other;
- a partner or auditor asks for a managed database with point-in-time recovery.

## Why it's a big job

Every database call in `src/lib` is synchronous (`get`, `all`, `run`, `tx` in `src/lib/db.ts`), and transactions are synchronous functions. PostgreSQL drivers are asynchronous, so every caller up to the routes becomes `async`. Module-created tables and the hand-written migrations also need moving into one migration system.

## Make it cheaper now (do these during normal work)

1. **Repositories:** each module keeps its SQL in its own `store.ts` (wallet, KYC and recovery already do). New code should never write SQL in routes. Item S9 in the [maintainability review](../maintainability.md#files-doing-several-jobs-srp) lists the routes that still do.
2. **One migration registry:** replace the per-module "create table on first use" code with ordered migrations recorded in `PRAGMA user_version` (item O3 in the [maintainability review](../maintainability.md#hard-coded-lists-that-should-be-registries-ocp)). The same list later becomes PostgreSQL migrations.
3. **Portable SQL:** avoid SQLite-only features in new queries (`json_each`, `INSERT OR REPLACE`), or keep them inside the repository so they're easy to find.

## Design when it happens

- Driver and query layer: `pg` with a thin typed helper, or Drizzle ORM. Decide then.
- Change `db.ts` to an async interface (`await get(...)`, `await tx(async (t) => ...)`), then convert modules one by one behind it, keeping SQLite running until the end.
- Data move: a one-off script that reads SQLite and writes PostgreSQL in batches, run during a short maintenance window, then a comparison of row counts and ledger totals (`reconcile()`).
- Hosting: Amazon RDS or Lightsail managed PostgreSQL in Mumbai.

## Acceptance criteria

- [ ] Every test passes against PostgreSQL.
- [ ] Ledger totals and audit chain verify after the data move.
- [ ] Rollback is possible: SQLite is kept, read-only, until a week after the switch.
