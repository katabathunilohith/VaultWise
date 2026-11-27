# Data model reference

Every table in the server's SQLite database, and every key the phone app keeps on the device.
As of commit `012a9fc` plus the server work for plans 03, 05, 06 and 07 (2026-11-22) and the external review fixes (2026-11-24), with the payout planner added on 27 November 2026.

## The server database

| Item | Value |
|---|---|
| Engine | SQLite through Node's built-in `node:sqlite` (`DatabaseSync`) |
| File | `<DATA_DIR>/vaultwise.db`. `DATA_DIR` is `VAULTWISE_DATA_DIR`, or `./data` when that is unset. |
| Uploads | `<DATA_DIR>/uploads` (proof images, ELA images, ID photos) |
| Audit anchors | `<DATA_DIR>/audit-anchors.jsonl`, or `AUDIT_ANCHOR_FILE`. Not a table: one JSON line per anchor, `{ ts, lastId, headHash, count }` (the audit chain's head), appended at every server start and once a day by the scheduler, and printed to the log as `[vaultwise] audit_anchor {...}`. `npm run audit:verify` checks the chain against it. See [`src/lib/audit-anchors/README.md`](../../src/lib/audit-anchors/README.md). |
| Opened by | `db()` in [`src/lib/db.ts`](../../src/lib/db.ts). One connection per process, kept on `globalThis.__vaultwiseDb`. |
| Pragmas | `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000` |
| Helpers | `all()`, `get()`, `run()`, `tx()` (nested calls join the outer transaction, which starts with `BEGIN IMMEDIATE`), `newId(prefix)`, `parseJson()` |
| Reset | `destroyDatabase()` closes the connection and deletes the `.db`, `-wal` and `-shm` files and the uploads folder. `POST /api/v1/reset` calls it in prototype mode. |

### Conventions

- **Money is integer minor units** (cents, pence). Each money row also carries `currency`, or takes it from the user.
- **Times are Unix milliseconds** (`INTEGER`), except calendar dates such as `vaults.target_date`, `kyc_records.dob` and the payout planner’s input and arrival dates, which use text.
- **IDs are text** like `usr_…`, `vlt_…`, `emg_…`, `kyc_…` (`newId()`: a prefix plus 9 random bytes in base64url). `ledger_entries`, `audit_log` and `recovery_attempts` use integer autoincrement IDs.
- **JSON is stored as `TEXT`**: for example `verifications.stages`, `limit_changes.assessment` and `kyc_records.checks`.
- **Foreign keys** link ledger entries to journals and accounts, and payout plans to users. Other parts of the app also identify their owner through stored account IDs.

### Where tables are created

There are two places, and both are idempotent (`CREATE TABLE IF NOT EXISTS`):

1. **The `SCHEMA` string in [`src/lib/db.ts`](../../src/lib/db.ts)** creates 26 tables, their indexes and 4 triggers when the connection opens.
   If hot reload keeps an old connection and `SCHEMA` has changed, `db()` runs `SCHEMA` and `migrate()` again.
2. **Feature modules create their own tables on first use.** Each module keeps a `WeakSet<DatabaseSync>` named `ready`, so it runs its `CREATE` once per database. A reset makes a new database object, so the tables are created again.
   These modules create 17 tables: `identities`, `vault_custom_rules`, `kyc_records`, `recovery_claims`, `recovery_attempts`, `wallet_settings` and `wallet_payments`, and, since plans 03 to 07, `mpin_attempts`, `mpin_meta`, `devices`, `alerts`, `push_tokens`, `otp_codes`, `otp_verifications`, `kyc_checks`, `bank_accounts` and `rate_limits`.
   The MPIN, devices, alerts, OTP, wallet and custom-rules modules add a database to their `ready` set only when no transaction is open, because a `CREATE` inside a transaction that rolls back would be lost (`POST /vaults` saves a custom rule inside the transaction that creates the vault, since 2026-11-24).

### Migrations

Migrations check `PRAGMA table_info` and only change what is missing. All but one are additive; `splitSharedStrategies()` rebuilds a table.

| Where | Change | Why |
|---|---|---|
| `migrate()` in [`src/lib/db.ts`](../../src/lib/db.ts) | `ALTER TABLE users ADD COLUMN country TEXT`, then backfill `country` from `jurisdiction` (`UK` → `GB`, `EU` → `DE`, anything else unchanged) | Countries replaced markets as the onboarding choice. |
| `migrate()` in [`src/lib/db.ts`](../../src/lib/db.ts) | `ALTER TABLE proofs ADD COLUMN ai_allowed INTEGER NOT NULL DEFAULT 0` | Records whether the person let the AI read the proof (`x-ai-consent`); older rows count as no. A database whose column was added earlier with `DEFAULT 1` keeps that default (SQLite can't change it without rebuilding the table), which is safe because every insert passes the value. |
| `migrate()` in [`src/lib/db.ts`](../../src/lib/db.ts) | `UPDATE users SET kyc_level = 1 WHERE kyc_status IN ('pending', 'needs_review') AND kyc_level = 0` | Older sign-ups waiting for an ID check were stored at level 0; the one rule (`kycLevelFor()` in `src/lib/kyc/levels.ts`) says 1. |
| `splitSharedStrategies()` in [`src/lib/db.ts`](../../src/lib/db.ts), when `strategies` has no `user_id` column | Renames the old table to `strategies_shared`, creates the per-customer table, copies each old row to the customer of the newest `strategy.gate_passed` or `strategy.gate_failed` audit row for that strategy, then drops the old table. A row with no such audit row is dropped (a backtest the customer can run again). All or nothing, inside a savepoint. | Strategies were shared, so one customer's backtest overwrote another's (maintainability B9, 2026-11-24). |
| `ensureIdentityTables()` in [`src/lib/auth/identities.ts`](../../src/lib/auth/identities.ts) | `ALTER TABLE users ADD COLUMN closed_at INTEGER` | Marks a closed account (data kept for audit). Only added on databases that touch the identity module. |
| `ensurePhoneColumns()` in [`src/lib/otp/phone.ts`](../../src/lib/otp/phone.ts) | `ALTER TABLE users ADD COLUMN phone TEXT`, `ALTER TABLE users ADD COLUMN phone_verified_at INTEGER` | The verified phone number (plan 06). Only added on databases that touch the OTP module. |
| `ensureDevicesTable()` in [`src/lib/devices/store.ts`](../../src/lib/devices/store.ts) | `ALTER TABLE devices ADD COLUMN cool_down INTEGER NOT NULL DEFAULT 1`, `ALTER TABLE users ADD COLUMN devices_revoked_at INTEGER` | Devices first seen after a sign-out, and the account's last device sign-out (security review, 22 November 2026). Only added on databases that touch the devices module. |
| `ensureOtpTables()` in [`src/lib/otp/store.ts`](../../src/lib/otp/store.ts) | `ALTER TABLE otp_codes ADD COLUMN new_number INTEGER NOT NULL DEFAULT 0` | Marks sends to a number the sending account hadn't verified, for the cross-account limit (security review, 22 November 2026). |
| `ensureChecksTables()` in [`src/lib/kyc/checks/store.ts`](../../src/lib/kyc/checks/store.ts) | `ALTER TABLE kyc_checks ADD COLUMN review_note TEXT` | A note only the reviewer sees, such as a duplicate PAN (security review, 22 November 2026). |
| `ensureRecoveryTables()` in [`src/lib/recovery/claims.ts`](../../src/lib/recovery/claims.ts) | `ALTER TABLE recovery_claims ADD COLUMN provisional INTEGER NOT NULL DEFAULT 0` | Whether the claimant got read-only access at once. |
| `ensureRecoveryTables()` | `CREATE UNIQUE INDEX idx_claims_one_pending ON recovery_claims(claimant_uid) WHERE status = 'pending'` | One pending claim per sign-in, even with parallel requests. |
| `ensureRecoveryTables()` | `ALTER TABLE recovery_claims ADD COLUMN notified_email TEXT` | The address the "recovery started" notice went to, so the claim keeps showing it after approval changes the account's email (2026-11-24). Older claims keep `NULL`. |

### Triggers

| Trigger | Effect |
|---|---|
| `ledger_no_update`, `ledger_no_delete` | `ledger_entries` is append-only. Any `UPDATE` or `DELETE` aborts. |
| `audit_no_update`, `audit_no_delete` | `audit_log` is append-only. Any `UPDATE` or `DELETE` aborts. |

## Tables

The tables are grouped by area. "Owner" is the module that creates most rows. "Also writes" lists other files that change the table.

### Overview

| Table | Created in | Owner | Purpose |
|---|---|---|---|
| `users` | `db.ts` | [`src/lib/users.ts`](../../src/lib/users.ts) | One row per wallet (customer). |
| `identities` | module | [`src/lib/auth/identities.ts`](../../src/lib/auth/identities.ts) | Firebase sign-ins and the wallet each one opens. |
| `payout_plans` | `db.ts` | [Planner storage](../../src/lib/payout-plan-store.ts) | Saved forecasts, sample marker and the actual amount reported at check-in. |
| `accounts` | `db.ts` | [`src/lib/ledger.ts`](../../src/lib/ledger.ts) | Ledger accounts (bank, vault, wallet, world and so on). |
| `journals` | `db.ts` | `src/lib/ledger.ts` | One row per balanced money movement. |
| `ledger_entries` | `db.ts` | `src/lib/ledger.ts` | The double-entry lines of each journal. Append-only. |
| `balances` | `db.ts` | `src/lib/ledger.ts` | Read model: current balance per account. |
| `vaults` | `db.ts` | [`src/lib/vaults.ts`](../../src/lib/vaults.ts) | Purpose-locked savings vaults and their contribution rules. |
| `vault_members` | `db.ts` | `src/lib/vaults.ts` | People in a joint vault. |
| `vault_custom_rules` | module | [`src/lib/custom-rules.ts`](../../src/lib/custom-rules.ts) | The owner's own rule for a custom vault. |
| `withdrawals` | `db.ts` | `src/lib/vaults.ts` | Proof-gated vault withdrawals. |
| `proofs` | `db.ts` | [`src/lib/verification/proofs.ts`](../../src/lib/verification/proofs.ts) (rows), the stages in `src/lib/verification/stages/` (`exif`, `extracted`, `phash`, `ela_path`) | Uploaded bills and receipts. |
| `verifications` | `db.ts` | [`src/lib/verification/persistence.ts`](../../src/lib/verification/persistence.ts), `proofs.ts`, `review.ts` | The verification run and decision for each proof. |
| `emergency_requests` | `db.ts` | [`src/lib/emergency.ts`](../../src/lib/emergency.ts) | Emergency cascade requests and receipt follow-up. |
| `fraud_flags` | `db.ts` | [`src/lib/fraud.ts`](../../src/lib/fraud.ts) | Risk flags for the operations team. |
| `audit_log` | `db.ts` | [`src/lib/audit.ts`](../../src/lib/audit.ts) | Hash-chained, append-only activity log. |
| `bank_transactions` | `db.ts` | `src/lib/vaults.ts` | Simulated open-banking transactions and round-ups. |
| `external_accounts` | `db.ts` | [`src/lib/seed.ts`](../../src/lib/seed.ts) | Linked bank accounts shown on the accounts page. |
| `sip_plans` | `db.ts` | [`src/lib/invest/core.ts`](../../src/lib/invest/core.ts) | Recurring Core investment plans. |
| `holdings` | `db.ts` | `src/lib/invest/core.ts` | Units held per sleeve and symbol. |
| `orders` | `db.ts` | `src/lib/invest/core.ts` | Filled Core buy orders. |
| `strategies` | `db.ts` | [`src/lib/invest/strategies.ts`](../../src/lib/invest/strategies.ts) | Each customer's Satellite strategies and their last backtest. |
| `paper_positions` | `db.ts` | `src/lib/invest/satellite.ts` | Satellite paper trades. |
| `paper_state` | `db.ts` | `src/lib/invest/satellite.ts` | Per-user, per-market state of the paper engine. |
| `user_limits` | `db.ts` | [`src/lib/limits/store.ts`](../../src/lib/limits/store.ts) | Each user's personal withdrawal and emergency limits. |
| `limit_changes` | `db.ts` | [`src/lib/limits/`](../../src/lib/limits/README.md) (`change.ts`, `emergency-request.ts`, `review.ts`, `expiry.ts`) | History of limit changes and emergency limit requests. |
| `kyc_records` | module | [`src/lib/kyc/store.ts`](../../src/lib/kyc/store.ts) | ID checks. Keeps the last 4 digits and an HMAC, never the full number. |
| `recovery_claims` | module | [`src/lib/recovery/claims.ts`](../../src/lib/recovery/claims.ts) | Requests to take over a wallet by proving the same ID. |
| `recovery_attempts` | module | `src/lib/recovery/claims.ts` (table), [`src/lib/recovery/limits.ts`](../../src/lib/recovery/limits.ts) (rows) | Rate-limit log for the recovery routes. |
| `wallet_settings` | module | [`src/lib/wallet/store.ts`](../../src/lib/wallet/store.ts) | Wallet daily limit and auto-save source per user. |
| `wallet_payments` | module | `src/lib/wallet/store.ts` | Payee and note for each wallet spend. |
| `market_cache` | `db.ts` | [`src/lib/invest/market.ts`](../../src/lib/invest/market.ts) | Cached price series. |
| `ai_cache` | `db.ts` | [`src/lib/engagement.ts`](../../src/lib/engagement.ts) | Cached AI output (the weekly insight). |
| `mpin_attempts` | module | [`src/lib/mpin/attempts.ts`](../../src/lib/mpin/attempts.ts) | Wrong-MPIN count and lock per user. |
| `mpin_meta` | module | [`src/lib/mpin/meta.ts`](../../src/lib/mpin/meta.ts) | How many digits each person's PIN has (for `upgradeDue`). |
| `devices` | module | [`src/lib/devices/store.ts`](../../src/lib/devices/store.ts) | Each app install or browser that has used an account. |
| `alerts` | module | [`src/lib/alerts/store.ts`](../../src/lib/alerts/store.ts) | The in-app alert inbox. |
| `push_tokens` | module | `src/lib/alerts/store.ts` | Expo push tokens per person and device. |
| `otp_codes` | module | [`src/lib/otp/store.ts`](../../src/lib/otp/store.ts) | Texted codes, stored as an HMAC. |
| `otp_verifications` | module | `src/lib/otp/store.ts` | Single-use tokens a right code gives. |
| `kyc_checks` | module | [`src/lib/kyc/checks/store.ts`](../../src/lib/kyc/checks/store.ts) | Each try of a KYC step (PAN, DigiLocker, bank). |
| `bank_accounts` | module | [`src/lib/bank/store.ts`](../../src/lib/bank/store.ts) | The bank account read by a reverse penny drop. |
| `rate_limits` | module | [`src/lib/rate-limit.ts`](../../src/lib/rate-limit.ts) | Request counts per hashed key and window. |

### People and sign-in

#### `users`

One row per wallet. In prototype mode the oldest row is the customer (`currentUser()`).
Also writes: `api/v1/me/route.ts` (name, email, jurisdiction), `mpin/change.ts` (`pin_hash`, through `setMpin()`), `otp/phone.ts` (phone), `devices/store.ts` (`devices_revoked_at`), `api/v1/invest/profile/route.ts` (risk profile), `kyc/service.ts` (KYC status, also for the steps flow through `setUserKyc()`), `invest/satellite.ts` (opt-in), `recovery/admin.ts` (the contact email on approval), `auth/identities.ts`, `seed.ts`.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT NOT NULL | |
| `email` | TEXT | |
| `jurisdiction` | TEXT NOT NULL | Market code. Sets the rules ([`src/lib/compliance.ts`](../../src/lib/compliance.ts)). |
| `currency` | TEXT NOT NULL | The wallet's currency. Fixed after onboarding. |
| `kyc_status` | TEXT NOT NULL, default `'verified'` | `pending`, `needs_review`, `verified` or `rejected` |
| `kyc_level` | INTEGER NOT NULL, default 2 | 2 verified, 1 pending or in review, 0 rejected |
| `pin_hash` | TEXT | The MPIN as a salted scrypt hash, checked for every money move ([mpin.md](../features/mpin.md)). Old accounts may still hold a 4-digit PIN. Left out of the data export. |
| `plan` | TEXT NOT NULL, default `'free'` | |
| `risk_profile` | TEXT | JSON: score, band, `completedAt` |
| `satellite_opt_in` | INTEGER NOT NULL, default 0 | |
| `satellite_opted_at` | INTEGER | |
| `created_at` | INTEGER NOT NULL | |
| `country` | TEXT | Added by `migrate()` |
| `closed_at` | INTEGER | Added by the identity module. Set when an account is closed in firebase mode. |
| `phone` | TEXT | Added by the OTP module. E.164 number, stored only once a texted code proved it. |
| `phone_verified_at` | INTEGER | Added by the OTP module. When the number was proved. For 72 hours after it the number can't reset the MPIN. |
| `devices_revoked_at` | INTEGER | Added by the devices module. When a device was last signed out of the account (any sign-out, a device signing itself out included). A sign-in older than it is refused unless from a trusted device, and a device first seen after it gets `devices.cool_down = 0`. |

#### `identities`

One row per Firebase uid, pointing at the wallet it opens. Created by `ensureIdentityTables()`.
Also writes: [`src/lib/auth/account.ts`](../../src/lib/auth/account.ts) (bind, close) and [`src/lib/auth/session.ts`](../../src/lib/auth/session.ts) (keeps `email` in step with the token).

| Column | Type | Notes |
|---|---|---|
| `uid` | TEXT PK | Firebase uid |
| `user_id` | TEXT | The wallet. Null means signed in with no wallet yet. |
| `email` | TEXT | |
| `provider` | TEXT | Sign-in provider |
| `status` | TEXT NOT NULL, default `'active'` | `active`, `recovery_pending` (read-only until a person approves) or `disabled` |
| `created_at`, `updated_at` | INTEGER NOT NULL | |

Index: `idx_identities_user (user_id)`.

#### `kyc_records`

One row per ID check. Created by `ensureKycTables()`. Written by `src/lib/kyc/store.ts` through `src/lib/kyc/service.ts`, and by `src/lib/kyc/checks/service.ts` (`conclude()`) for the steps flow.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `kyc_…` |
| `user_id` | TEXT NOT NULL | |
| `doc_type` | TEXT NOT NULL | See `src/lib/kyc/ids.ts`. Always `pan` for the steps flow. |
| `id_last4` | TEXT | Last 4 characters only |
| `id_hash` | TEXT | HMAC-SHA256 of the normalised number with `IDENTITY_SECRET` |
| `name_on_doc`, `dob` | TEXT | Read from the document. Steps flow: the Aadhaar name (or the first name that differs) and the year of birth only. |
| `status` | TEXT NOT NULL | `pending`, `needs_review`, `verified` or `rejected` |
| `provider` | TEXT NOT NULL | `practice` or `external` (`KYC_PROVIDER`), or `checks:<provider>` for the steps flow (for example `checks:test`) |
| `checks`, `reasons` | TEXT | JSON arrays. The steps flow writes one check line per step. |
| `file_path` | TEXT | ID photo in uploads. Deleted on rejection. Null for the steps flow (no photo). |
| `decided_by`, `decided_at` | TEXT, INTEGER | Reviewer and time |
| `created_at` | INTEGER NOT NULL | |

Indexes: `idx_kyc_user (user_id, created_at)`, `idx_kyc_hash (id_hash)`.

#### `recovery_claims`

A new sign-in asking to take over an existing, verified wallet by proving the same ID. Created by `ensureRecoveryTables()`.
Also writes: `src/lib/recovery/claimant.ts` (create, cancel), `src/lib/recovery/admin.ts` (decide), `src/lib/auth/account.ts` (closing an account ends its claims).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `claimant_uid` | TEXT NOT NULL | The new sign-in |
| `claimant_email` | TEXT | |
| `user_id` | TEXT NOT NULL | The wallet being claimed |
| `doc_type`, `id_last4` | TEXT | |
| `status` | TEXT NOT NULL | `pending`, `approved`, `rejected`, `cancelled` or `expired` (after 7 days, `CLAIM_TTL_MS`) |
| `checks`, `reasons` | TEXT | JSON arrays |
| `file_path` | TEXT | ID photo. Deleted once rejected, cancelled or expired. |
| `provisional` | INTEGER NOT NULL, default 0 | 1 = automated checks passed and the claimant got read-only access at once |
| `notified_email` | TEXT | The account's address the "recovery started" notice went to; `""` when the account had none; `NULL` for claims made before 2026-11-24 (shown as the account's current email). Added on first use. `ClaimView.notifiedEmail` shows it masked. |
| `created_at`, `decided_at`, `decided_by` | INTEGER, INTEGER, TEXT | `decided_by` can be a reviewer, `claimant` or `system:expiry` |

Indexes: `idx_claims_uid (claimant_uid, created_at)`, `idx_claims_status (status, created_at)`, unique partial `idx_claims_one_pending (claimant_uid) WHERE status = 'pending'`.

#### `recovery_attempts`

Rate-limit log for `/recovery/find`, `/recovery/reset` and `/recovery/claim`. Rows older than 7 days are deleted on each try.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `bucket` | TEXT NOT NULL | `find`, `reset` or `claim` |
| `client_key` | TEXT NOT NULL | SHA-256 (first 32 hex) of `ip:…`, `device:…` or `uid:…`, or `*` for the server-wide count |
| `ts` | INTEGER NOT NULL | |

Index: `idx_attempts (bucket, client_key, ts)`.

### Payout planning

#### `payout_plans`

| Field | Storage and meaning |
|---|---|
| `user_id`, `id` | Composite primary key. The customer ID refers to `users.id` with cascading deletion. The request UUID makes retries of one save idempotent for that customer. |
| `currency`, `input_json` | Account currency and the validated original inputs, including bills in the order entered. Monetary inputs use integer minor units. |
| `is_example`, `created_at` | Integer sample flag and server creation timestamp in milliseconds. |
| `actual_date`, `actual_amount`, `checked_at` | Nullable until check-in. The date and minor units come from the user, and the server records the check-in timestamp. The server writes all three in one transaction. |

The index `idx_payout_plans_recent` supports per-user history sorted by newest creation time. The core schema creates the empty table on first open for existing accounts. The active database drops a customer's plans on account closure and the practice reset deletes the whole database. Archived backups follow the deployment's retention schedule. [Storage code](../../src/lib/payout-plan-store.ts) · [Forecast and check-in](../features/payout-planner.md)

### Ledger

[`src/lib/ledger.ts`](../../src/lib/ledger.ts) is the only writer. Every money movement is a journal whose entries sum to zero.

#### `accounts`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `user_id` | TEXT | Null for shared accounts |
| `kind` | TEXT NOT NULL | `bank`, `vault`, `core_cash`, `core_securities`, `satellite_cash`, `world`, `fees` or `wallet`. All except `world` and `fees` may not go negative. |
| `name` | TEXT NOT NULL | |
| `currency` | TEXT NOT NULL | |
| `ref_id` | TEXT | For example the vault id of a vault account |
| `created_at` | INTEGER NOT NULL | |

Index: `idx_accounts_user (user_id, kind)`.

#### `journals`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `user_id` | TEXT | |
| `kind` | TEXT NOT NULL | For example `deposit`, `contribution_rule`, `roundup`, `invest_buy`, `wallet_top_up`, `wallet_spend`, `wallet_cash_out` |
| `memo` | TEXT | |
| `ref_type`, `ref_id` | TEXT | What the journal is about, for example `vault` or `wallet_payment` |
| `created_at` | INTEGER NOT NULL | |

Index: `idx_journals_user (user_id, created_at)`.

#### `ledger_entries`

Append-only (triggers).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `journal_id` | TEXT NOT NULL → `journals(id)` | |
| `account_id` | TEXT NOT NULL → `accounts(id)` | |
| `amount` | INTEGER NOT NULL | Signed, minor units |
| `currency` | TEXT NOT NULL | |
| `created_at` | INTEGER NOT NULL | |

Indexes: `idx_entries_account (account_id)`, `idx_entries_journal (journal_id)`.

#### `balances`

A projection of `ledger_entries`, updated in the same transaction. `reconcile()` compares it with a full replay (shown on `/admin/overview`).

| Column | Type | Notes |
|---|---|---|
| `account_id` | TEXT PK | |
| `balance` | INTEGER NOT NULL, default 0 | |
| `version` | INTEGER NOT NULL, default 0 | Bumped on each change |
| `updated_at` | INTEGER | |

### Vaults and withdrawals

#### `vaults`

Also writes: `api/v1/vaults/[id]/route.ts` (PATCH runs SQL directly), [`src/lib/wallet/moves.ts`](../../src/lib/wallet/moves.ts) (`next_run_at`), `seed.ts`.
`POST /vaults` creates the vault, its custom rule and the opening deposit in one transaction.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `user_id` | TEXT NOT NULL | |
| `account_id` | TEXT NOT NULL | Its ledger account |
| `name` | TEXT NOT NULL | |
| `category` | TEXT NOT NULL | `health`, `education`, `housing`, `emergency`, `retirement` or `custom` |
| `template` | TEXT NOT NULL | The rule set used for proofs. Same values as `category`. |
| `target_amount` | INTEGER NOT NULL | |
| `target_date` | TEXT | `YYYY-MM-DD` |
| `rule_type` | TEXT NOT NULL, default `'none'` | `none`, `fixed`, `percent_income` or `roundup` |
| `rule_amount` | INTEGER | For `fixed` |
| `rule_percent` | REAL | For `percent_income` (1–50) |
| `rule_frequency` | TEXT | `weekly`, `biweekly` or `monthly` (for `fixed`) |
| `next_run_at` | INTEGER | Next auto-save. Each scheduled run (from the bank in `runDueContributions()`, or from the wallet in `runDueWalletContributions()`) commits together with its move of `next_run_at`, so a run already paid is never paid again. |
| `is_joint` | INTEGER NOT NULL, default 0 | |
| `status` | TEXT NOT NULL, default `'locked'` | `closed` also exists |
| `created_at` | INTEGER NOT NULL | |

#### `vault_members`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `vault_id` | TEXT NOT NULL | |
| `name` | TEXT NOT NULL | |
| `email` | TEXT | |
| `role` | TEXT NOT NULL | `owner` for the creator. Other values: Not confirmed. |
| `contributed` | INTEGER NOT NULL, default 0 | |
| `created_at` | INTEGER NOT NULL | |

#### `vault_custom_rules`

Created by `ensureTable()` in [`src/lib/custom-rules.ts`](../../src/lib/custom-rules.ts). The whole feature can be removed by deleting that file and the lines marked `custom-rules`.

| Column | Type | Notes |
|---|---|---|
| `vault_id` | TEXT PK | |
| `uses` | TEXT NOT NULL | JSON array of 1–5 strings: what the money may pay for |
| `proof` | TEXT NOT NULL | The proof the owner promises to show |
| `created_at` | INTEGER NOT NULL | |

#### `withdrawals`

Also writes: `verification/persistence.ts` (`applyOutcome()`: denied or in review; a payout goes through `payoutWithdrawal()` in `vaults.ts`), `verification/proofs.ts` (verifying), `verification/review.ts` (appealed), `seed.ts`.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `user_id`, `vault_id` | TEXT NOT NULL | |
| `amount` | INTEGER NOT NULL | |
| `payee`, `note` | TEXT | |
| `status` | TEXT NOT NULL | `awaiting_proof`, `verifying`, `in_review`, `appealed`, `paid`, `denied`, `cancelled` or `expired` |
| `proof_id` | TEXT | |
| `decision_reason` | TEXT | |
| `journal_id` | TEXT | The payout journal |
| `created_at`, `decided_at` | INTEGER | |

#### `bank_transactions`

Simulated open-banking feed: salary credits and card purchases (`/accounts/simulate`, seed data).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `user_id` | TEXT NOT NULL | |
| `merchant`, `category` | TEXT NOT NULL | |
| `amount` | INTEGER NOT NULL | |
| `direction` | TEXT NOT NULL | `debit` or `credit` |
| `roundup` | INTEGER NOT NULL, default 0 | Spare change for the round-up rule |
| `roundup_status` | TEXT NOT NULL, default `'none'` | `none`, `pending` or `swept` |
| `journal_id` | TEXT | |
| `created_at` | INTEGER NOT NULL | |

#### `external_accounts`

Only written by the demo seed. When a user has none, `GET /accounts` shows a placeholder "Linked bank". The primary account's balance is replaced by the ledger's `bank` balance.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `user_id` | TEXT NOT NULL | |
| `institution`, `name`, `kind`, `mask` | TEXT NOT NULL | |
| `balance` | INTEGER NOT NULL | |
| `is_primary` | INTEGER NOT NULL, default 0 | |
| `created_at` | INTEGER NOT NULL | |

### Verification and emergencies

#### `proofs`

One row per uploaded document.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `user_id` | TEXT NOT NULL | |
| `vault_id`, `withdrawal_id`, `emergency_id` | TEXT | What the proof is for |
| `purpose` | TEXT NOT NULL | `withdrawal` or `emergency_receipt` |
| `category` | TEXT NOT NULL | Vault template, or `emergency` |
| `file_name`, `mime` | TEXT | |
| `size` | INTEGER | |
| `sha256` | TEXT | Exact-reuse check |
| `phash` | TEXT | Perceptual hash, near-reuse check |
| `stored_path` | TEXT | Original file in uploads |
| `ela_path` | TEXT | Error-level-analysis image |
| `exif`, `extracted` | TEXT | JSON |
| `ai_allowed` | INTEGER NOT NULL, default 0 | 1 only when the upload said `x-ai-consent: yes` (`createProof()` requires `aiAllowed`, and only `true` stores 1). The seed stores 1 for the bundled sample documents. Older databases may keep `DEFAULT 1` on the column; every insert passes the value. Added by `migrate()`. |
| `created_at` | INTEGER NOT NULL | |

#### `verifications`

One per proof.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `proof_id` | TEXT UNIQUE NOT NULL | |
| `status` | TEXT NOT NULL | `processing` while the pipeline runs |
| `stages` | TEXT NOT NULL | JSON array of the 6 stages |
| `confidence` | REAL | |
| `decision` | TEXT | `auto_approved`, `auto_denied` or `human_review` |
| `final_decision` | TEXT | `approved`, `denied` or `appealed` |
| `reasons` | TEXT | JSON array |
| `model_version` | TEXT | |
| `reviewer`, `reviewer_note`, `appeal_note` | TEXT | |
| `queued_at`, `decided_at` | INTEGER | Used for the review SLA |
| `duration_ms` | INTEGER | Pipeline time |
| `created_at` | INTEGER NOT NULL | |

#### `emergency_requests`

Also writes: `verification/proofs.ts` (receipt submitted), `verification/persistence.ts` (receipt result), `seed.ts`.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `emg_…` |
| `user_id` | TEXT NOT NULL | |
| `amount` | INTEGER NOT NULL | |
| `reason_code` | TEXT NOT NULL | Key of `EMERGENCY_REASONS` |
| `note` | TEXT | |
| `tier` | INTEGER NOT NULL | 1 (Health vaults) or 2 (other vaults) |
| `plan`, `guardrails` | TEXT NOT NULL | JSON |
| `risk_score` | INTEGER NOT NULL, default 0 | 0–100. 60 or more raises a fraud flag. |
| `status` | TEXT NOT NULL | `released`, `processing` (Tier 2 hold), `cooling_off` or `blocked` |
| `release_at`, `released_at` | INTEGER | |
| `receipt_status` | TEXT NOT NULL, default `'not_required'` | Also `optional`, `requested`, `submitted`, `verified`, `rejected`, `overdue` |
| `receipt_due_at` | INTEGER | |
| `receipt_proof_id` | TEXT | |
| `created_at` | INTEGER NOT NULL | |

#### `fraud_flags`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `user_id` | TEXT | |
| `source` | TEXT NOT NULL | For example `emergency` or `limits` |
| `ref_id` | TEXT | |
| `severity` | TEXT NOT NULL | `low`, `medium` or `high` |
| `score` | INTEGER NOT NULL | |
| `description` | TEXT NOT NULL | |
| `status` | TEXT NOT NULL, default `'open'` | `resolved` or `dismissed` after review |
| `resolution` | TEXT | |
| `created_at`, `resolved_at` | INTEGER | |

#### `audit_log`

Append-only (triggers) and hash-chained. Each row's `hash` is SHA-256 of `prev_hash` plus a JSON array of `[ts, user_id, actor, actor_type, action, entity_type, entity_id, details]`. The first `prev_hash` is 64 zeros (`GENESIS`). `verifyAuditChain()` replays the chain through `walkAuditRows()`, the same pure walk the offline checker (`npm run audit:verify`) uses; `auditHead()` gives the head an anchor records (the audit anchors file, above).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `ts` | INTEGER NOT NULL | |
| `user_id` | TEXT | |
| `actor` | TEXT NOT NULL | |
| `actor_type` | TEXT NOT NULL | `user`, `system`, `model` or `reviewer` |
| `action` | TEXT NOT NULL | Dotted, for example `vault.updated`, `kyc.verified`, `privacy.data_exported` |
| `entity_type`, `entity_id` | TEXT | |
| `details` | TEXT | JSON |
| `prev_hash`, `hash` | TEXT NOT NULL | |

### Limits

#### `user_limits`

| Column | Type | Notes |
|---|---|---|
| `user_id` | TEXT PK | |
| `single_withdrawal`, `daily_withdrawal`, `monthly_emergency` | INTEGER NOT NULL | Minor units |
| `updated_at` | INTEGER NOT NULL | |

#### `limit_changes`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `user_id` | TEXT NOT NULL | |
| `kind` | TEXT NOT NULL | `tighten`, `standard` or `emergency` |
| `status` | TEXT NOT NULL | `applied`, `in_review`, `denied`, `reverted` or `superseded` |
| `before_limits`, `after_limits` | TEXT NOT NULL | JSON. For an applied emergency increase: `after_limits` is what the increase grants each limit it raises, and `before_limits` is what that limit falls back to on expiry (the lower of the limit when applied and the fall-back of any other increase still applied to it); other limits hold their value when it was applied. A reviewer's approval rewrites both to the increase as applied (since 2026-11-24; before, the filed values were applied whole). See [`src/lib/limits/README.md`](../../src/lib/limits/README.md). |
| `reason_code`, `explanation` | TEXT | Emergency requests |
| `assessment` | TEXT | JSON from the AI assessor |
| `model` | TEXT | |
| `reviewer`, `reviewer_note` | TEXT | |
| `expires_at` | INTEGER | When an emergency increase reverts |
| `created_at`, `decided_at` | INTEGER | |

Index: `idx_limit_changes_user (user_id, created_at)`.

### Wallet

Created by `ensureWalletTables()` in [`src/lib/wallet/store.ts`](../../src/lib/wallet/store.ts). The wallet's money itself is a ledger account with `kind = 'wallet'`.

#### `wallet_settings`

| Column | Type | Notes |
|---|---|---|
| `user_id` | TEXT PK | |
| `daily_limit` | INTEGER | Null = no limit |
| `limit_raised_at` | INTEGER | Raising or turning off is allowed once per 30 days |
| `auto_save_source` | TEXT NOT NULL, default `'bank'` | `bank` or `wallet` |

#### `wallet_payments`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `user_id` | TEXT NOT NULL | |
| `journal_id` | TEXT NOT NULL | The spend journal |
| `payee` | TEXT NOT NULL | |
| `note` | TEXT | |
| `created_at` | INTEGER NOT NULL | |

Index: `idx_wallet_payments_user (user_id, created_at)`.

### MPIN

Both tables are created on first use by [`src/lib/mpin`](../../src/lib/mpin/README.md) ([mpin.md](../features/mpin.md)).

#### `mpin_attempts`

| Column | Type | Notes |
|---|---|---|
| `user_id` | TEXT PK | |
| `failures` | INTEGER NOT NULL, default 0 | Wrong tries since the last right MPIN. A lock starts on every 5th. |
| `locked_until` | INTEGER | Ms. May be in the past (an old lock). Cleared by a right MPIN or a new one. |
| `updated_at` | INTEGER NOT NULL | |

#### `mpin_meta`

| Column | Type | Notes |
|---|---|---|
| `user_id` | TEXT PK | |
| `pin_length` | INTEGER NOT NULL | Digits in the PIN, recorded when it is set or typed correctly. No row: not seen since the module shipped. |
| `updated_at` | INTEGER NOT NULL | |

### Devices, alerts and texted codes

Created on first use by [`src/lib/devices`](../../src/lib/devices/README.md), [`src/lib/alerts`](../../src/lib/alerts/README.md) and [`src/lib/otp`](../../src/lib/otp/README.md) ([devices-alerts-otp.md](../features/devices-alerts-otp.md)).

#### `devices`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `dev_…` |
| `user_id` | TEXT NOT NULL | |
| `install_id` | TEXT NOT NULL | The client's `x-device-id` |
| `platform` | TEXT | `ios`, `android`, `web` or null |
| `app_version` | TEXT | From `x-app-version` |
| `first_seen` | INTEGER NOT NULL | The 24-hour cool-down counts from here |
| `last_seen` | INTEGER NOT NULL | Written at most once a minute |
| `trusted_at` | INTEGER | Set for the account's first device (with sign-in on, only on a wallet opened in the last hour: the sign-up device; in prototype mode always), or when trusted with a code and the MPIN |
| `revoked_at` | INTEGER | Set when signed out. The row is kept, so the same install id stays signed out. |
| `cool_down` | INTEGER NOT NULL, default 1 | 1: the device trusts itself 24 hours after `first_seen`. 0 for a device first seen after a device was signed out of the account: only a texted code and the MPIN trust it. Added to older tables on first use. |

Index: `idx_devices_user_install (user_id, install_id)`, unique.

#### `alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `alt_…` |
| `user_id` | TEXT NOT NULL | |
| `kind` | TEXT NOT NULL | `new_device`, `device_trusted`, `device_revoked`, `money_out`, `limit_loosened`, `mpin_locked`, `mpin_changed` or `phone_verified` |
| `title` | TEXT NOT NULL | At most 120 characters |
| `body` | TEXT NOT NULL | At most 500 characters |
| `created_at` | INTEGER NOT NULL | |
| `read_at` | INTEGER | Null = unread |

Index: `idx_alerts_user (user_id, created_at)`. Written inside the caller's transaction, so rolled-back work leaves no alert.

#### `push_tokens`

| Column | Type | Notes |
|---|---|---|
| `token` | TEXT PK | An Expo push token. Moves to whichever account registers it last. |
| `user_id` | TEXT NOT NULL | |
| `platform` | TEXT NOT NULL | `ios`, `android` or `web` |
| `device_id` | TEXT | `devices.id` of the device that registered it; signing that device out deletes the token |
| `created_at`, `updated_at` | INTEGER NOT NULL | |

Index: `idx_push_tokens_user (user_id, updated_at)`. At most 10 per person (the newest are kept).

#### `otp_codes`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `otp_…` |
| `user_id` | TEXT NOT NULL | |
| `purpose` | TEXT NOT NULL | `phone_verify`, `device_trust` or `mpin_reset` |
| `phone` | TEXT NOT NULL | E.164 number the code went to |
| `salt` | TEXT NOT NULL | 16 random bytes, hex |
| `code_hash` | TEXT NOT NULL | `HMAC-SHA256(IDENTITY_SECRET or a fixed dev key, "otp:<id>:<salt>:<code>")`. The code itself is never stored. |
| `tries` | INTEGER NOT NULL, default 0 | Wrong tries (3 use the code up) |
| `created_at`, `expires_at` | INTEGER NOT NULL | Valid 5 minutes |
| `used_at` | INTEGER | Used, used up, replaced by a newer code, or never delivered |
| `new_number` | INTEGER NOT NULL, default 0 | 1 for a `phone_verify` send to a number the sending account hadn't verified. The limit of 15 an hour per number across accounts counts only these rows. Added to older tables on first use. |

Indexes: `idx_otp_codes_user (user_id, created_at)`, `idx_otp_codes_phone (phone, created_at)` (for the hourly limits).

#### `otp_verifications`

| Column | Type | Notes |
|---|---|---|
| `token_hash` | TEXT PK | SHA-256 of the token |
| `otp_id` | TEXT NOT NULL | The code that gave it |
| `user_id` | TEXT NOT NULL | |
| `purpose` | TEXT NOT NULL | |
| `phone` | TEXT NOT NULL | The number the code went to |
| `created_at`, `expires_at` | INTEGER NOT NULL | Valid 10 minutes |
| `used_at` | INTEGER | Single use |

### KYC steps flow

Created on first use by [`src/lib/kyc/checks/store.ts`](../../src/lib/kyc/checks/store.ts) and [`src/lib/bank/store.ts`](../../src/lib/bank/store.ts) ([identity.md](../features/identity.md), section 3a). Only written when `KYC_FLOW=steps`.

#### `kyc_checks`

One row per try of a step. The newest row for a step made after the last rejection says where that step is.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `chk_…` |
| `user_id` | TEXT NOT NULL | |
| `step` | TEXT NOT NULL | `pan`, `aadhaar` or `bank` |
| `status` | TEXT NOT NULL | `started`, `done`, `review`, `failed` or `expired` |
| `provider` | TEXT NOT NULL | `test` or `setu` |
| `request_id` | TEXT | The provider's request id (DigiLocker, reverse penny drop) |
| `last4` | TEXT | Last 4 of the PAN, Aadhaar or account number |
| `id_hash` | TEXT | PAN only: `HMAC-SHA256(IDENTITY_SECRET, "pan:<number>")`, the same as `kyc_records.id_hash` |
| `name` | TEXT | The name from the document: the PAN's registered name, the Aadhaar name or the bank holder name. (PAN rows from before 22 November 2026 kept it only when it differed.) |
| `year_of_birth` | INTEGER | Aadhaar only |
| `name_match` | TEXT | `match`, `partial`, `mismatch` or `unknown` |
| `bank_account_id` | TEXT | `bank_accounts.id` for the bank step |
| `reasons` | TEXT | JSON array of sentences the customer may see |
| `review_note` | TEXT | A note only the reviewer sees, shown in the step's check line (today: "this PAN is already on another open account"). Added to older tables on first use. |
| `expires_at` | INTEGER | When an open request lapses |
| `created_at`, `updated_at` | INTEGER NOT NULL | |

Indexes: `idx_kyc_checks_user (user_id, step, created_at)`, `idx_kyc_checks_hash (id_hash)`. Never a full PAN, Aadhaar or account number.

#### `bank_accounts`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `bank_…` |
| `user_id` | TEXT NOT NULL | |
| `ifsc` | TEXT NOT NULL | Upper-cased |
| `account_last4` | TEXT NOT NULL | `saveBankAccount()` refuses anything but 4 characters |
| `holder_name` | TEXT NOT NULL | |
| `verified_at` | INTEGER | When the account was confirmed: the bank step passed (the payment came from it and the holder's name matches), or a person approved a check whose holder name differed (`verifyBankAccount()`, called through `confirmBankOnApproval()`). Null while the name waits for a person, and for good after a rejection. |
| `provider_ref` | TEXT | The provider's request id, for support |
| `created_at` | INTEGER NOT NULL | |

Index: `idx_bank_accounts_user (user_id, created_at)`.

### Rate limits

#### `rate_limits`

Created on first use by [`src/lib/rate-limit.ts`](../../src/lib/rate-limit.ts) ([running-online.md](../features/running-online.md)).

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT NOT NULL | First 32 hex characters of SHA-256 of `"<windowMs>|<key>"`. Keys like `all:ip:<ip>` are never stored in clear. |
| `window_start` | INTEGER NOT NULL | Start of the fixed window (ms) |
| `count` | INTEGER NOT NULL | Requests counted in the window |
| `expires_at` | INTEGER NOT NULL | End of the window; ended rows are deleted at most once a minute |

Primary key `(key, window_start)`. Index: `idx_rate_limits_expiry (expires_at)`.

### Investing

#### `sip_plans`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `user_id` | TEXT NOT NULL | |
| `amount` | INTEGER NOT NULL | |
| `frequency` | TEXT NOT NULL | `weekly` or `monthly` |
| `next_run_at` | INTEGER NOT NULL | Run by the scheduler tick |
| `active` | INTEGER NOT NULL, default 1 | |
| `created_at` | INTEGER NOT NULL | |

#### `holdings`

| Column | Type | Notes |
|---|---|---|
| `user_id`, `sleeve`, `symbol` | TEXT NOT NULL | Composite primary key |
| `units` | REAL NOT NULL | |
| `cost` | INTEGER NOT NULL | Cost basis, minor units |

#### `orders`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `user_id` | TEXT NOT NULL | |
| `sleeve` | TEXT NOT NULL | `core` |
| `symbol` | TEXT NOT NULL | |
| `side` | TEXT NOT NULL | `buy` |
| `units`, `price` | REAL NOT NULL | |
| `amount` | INTEGER NOT NULL | |
| `status` | TEXT NOT NULL | `filled` |
| `source` | TEXT NOT NULL | `manual` (from `/invest/core/buy`) or `sip` (scheduler tick) |
| `created_at` | INTEGER NOT NULL | |

#### `strategies`

One row per customer and strategy, primary key `(user_id, id)` (since 2026-11-24; before, one shared row per strategy, migrated by `splitSharedStrategies()` above). Queries live in [`src/lib/invest/strategies.ts`](../../src/lib/invest/strategies.ts): `strategyFor(userId, id)`, `saveStrategyBacktest()` (replaces only that customer's row) and `allStrategies()` (every customer's, with their name, for the reviewer console).

| Column | Type | Notes |
|---|---|---|
| `user_id` | TEXT NOT NULL | The customer who ran the backtest |
| `id` | TEXT NOT NULL | `strategyId(symbol, tf)`: `smc:<symbol>:<tf>` |
| `name` | TEXT NOT NULL | |
| `params` | TEXT NOT NULL | JSON |
| `stage` | TEXT NOT NULL | Governance stage |
| `last_backtest` | TEXT | JSON result |
| `paper_started_at`, `promoted_at` | INTEGER | |
| `created_at` | INTEGER NOT NULL | |

#### `paper_positions`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `user_id`, `strategy_id`, `symbol`, `timeframe` | TEXT NOT NULL | |
| `direction` | TEXT NOT NULL | Long or short |
| `entry`, `stop`, `target` | REAL NOT NULL | |
| `risk_amount` | INTEGER NOT NULL | |
| `confluence` | INTEGER NOT NULL | Signal score |
| `components` | TEXT | JSON |
| `bar_time` | INTEGER NOT NULL | |
| `status` | TEXT NOT NULL | `open` or `closed` |
| `exit`, `r_multiple` | REAL | |
| `pnl` | INTEGER | |
| `opened_at`, `closed_at` | INTEGER | |

#### `paper_state`

| Column | Type | Notes |
|---|---|---|
| `user_id`, `symbol`, `timeframe` | TEXT NOT NULL | Composite primary key |
| `enabled` | INTEGER NOT NULL, default 1 | Toggled by `PATCH /invest/satellite/markets` |
| `last_bar_t` | INTEGER NOT NULL | Last processed bar |
| `halted_until` | INTEGER | Circuit breaker |

### Caches

#### `market_cache`

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | |
| `fetched_at` | INTEGER NOT NULL | |
| `source` | TEXT NOT NULL | The price provider's name (`yahoo` by default, `src/lib/invest/prices.ts`) |
| `payload` | TEXT NOT NULL | JSON series |

#### `ai_cache`

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | `insight:<userId>:<YYYY-MM-DD>` |
| `created_at` | INTEGER NOT NULL | |
| `payload` | TEXT NOT NULL | JSON `{ headline, body, tip, source }`. Only written when the request consented to AI. |

## Phone-side storage (`mobile/`)

The phone app keeps no database. It stores small values through [`mobile/src/lib/storage.ts`](../../mobile/src/lib/storage.ts):

| Platform | Backend for `getItem` / `setItem` / `removeItem` |
|---|---|
| iOS and Android | **SecureStore** (`expo-secure-store`: Keychain on iOS, Keystore on Android) |
| Web preview (`npm run web`) | **localStorage** (each call is wrapped in try/catch, since it can be missing in private windows) |

Every `vw.*` key written through `setItem()` is also recorded in an index key, `vw.itemKeys`, because the Keychain can't list its keys.
`wipeDeviceData()` uses the index, a frozen list of older un-indexed keys, the case list and (on web) a scan of localStorage to delete everything.
Sign-out and "Delete account" call `resetDevice()` in [`mobile/src/lib/session.ts`](../../mobile/src/lib/session.ts), which keeps the device settings `vw.theme`, `vw.haptics` and `vw.connection`, and the install id `vw.deviceId` unless the device is forgotten (closing a signed-in account, a remote sign-out, the wrong-PIN lockout).

SecureStore can reject values over about 2 KB on some iOS versions. Bigger secrets (the Firebase session, the sensitive Practice slices) go through the chunked helpers: 600-character chunks in one of two slots (`<key>_a.<i>` or `<key>_b.<i>`), with a head under `<key>` (`chunks:<slot>:<n>`) that is switched last, so a write cut short reads as the old value. Older `chunks:<n>` heads still read.

**iOS fresh install.** The Keychain outlives the app on iOS. Every storage call first waits for `installReady()`: with no `vw.install` marker in AsyncStorage and AsyncStorage empty (a fresh install), every `vw.*` item and every key listed in `vw.chunkedKeys` is wiped before anything reads them; with something in AsyncStorage (an upgrade) nothing is wiped. See [phone-security.md](../features/phone-security.md#fresh-install-wipe-ios).

### Keys in `KEYS` (`mobile/src/lib/storage.ts`)

| Key | Constant | Read and written by | Holds | Kept on Delete account |
|---|---|---|---|---|
| `vw.connection` | `KEYS.connection` | [`lib/api/connection.ts`](../../mobile/src/lib/api/connection.ts) | JSON `{ pref: "auto" \| "live" \| "demo", baseUrl }`: the data source and server address | Yes |
| `vw.haptics` | `KEYS.haptics` | [`lib/haptics/engine.ts`](../../mobile/src/lib/haptics/engine.ts) | `off`, `subtle` or `full` | Yes |
| `vw.appLock` | `KEYS.appLock` | [`lib/auth/app-lock.ts`](../../mobile/src/lib/auth/app-lock.ts) | `"1"` or `"0"`: app lock on or off | No |
| `vw.devicePin` | `KEYS.devicePin` | [`lib/auth/device-pin.ts`](../../mobile/src/lib/auth/device-pin.ts) | `pbkdf2:<iterations>:<salt>:<hash>:<digits>` (PBKDF2-HMAC-SHA256, iterations measured per phone); older `<salt>:<hash>[:<digits>]` SHA-256 values until the next right PIN. The PIN itself never leaves the phone. | No |
| `vw.deviceId` | `KEYS.deviceId` | [`lib/api/device.ts`](../../mobile/src/lib/api/device.ts) | Random UUID sent as `x-device-id` on every request. Read with `getItemStrict()`, so a failed read never makes a new one. | Yes, unless the device is forgotten |
| `vw.theme` | `KEYS.theme` | [`theme/index.tsx`](../../mobile/src/theme/index.tsx) | JSON `{ pref: "system" \| "light" \| "dark", cvd: boolean }` (colour-vision-friendly gains) | Yes |
| `vw.onboarded` | `KEYS.onboardedLocally` | Nothing reads or writes it | Unused at this commit | n/a |
| `vw.cases` | `KEYS.cases` | [`features/assistant/support/cases.ts`](../../mobile/src/features/assistant/support/cases.ts) | JSON list of support cases without their messages (at most 5 open) | No |

### Other `vw.*` keys

| Key | Read and written by | Holds | Kept on Delete account |
|---|---|---|---|
| `vw.cases.<caseId>` | `features/assistant/support/cases.ts` (`caseMessageKey()`) | One support message (up to 600 characters) | No |
| `vw.milestone.<vaultId>` | [`features/vaults/hooks.ts`](../../mobile/src/features/vaults/hooks.ts) | The last vault milestone level the person saw (number as text). Unsafe characters in the id become `_`. | No |
| `vw.pinAttempts` | [`features/account/pin-guard.ts`](../../mobile/src/features/account/pin-guard.ts) | JSON `{ fails, until }`: the wrong-PIN counter (4 free tries, then waits of 1, 5, 30 and 60 minutes; the 10th ends it). A try is written before the PIN is checked. | No |
| `vw.bioUnlock` | [`lib/auth/app-lock.ts`](../../mobile/src/lib/auth/app-lock.ts) | `"0"` when Face ID / fingerprint may not unlock | No |
| `vw.hideBalances` | [`features/protection/balances.ts`](../../mobile/src/features/protection/balances.ts) | `"1"` or `"0"` | No |
| `vw.mpin.biometric` | [`features/mpin/biometric.ts`](../../mobile/src/features/mpin/biometric.ts) | `"1"` while the payments shortcut is on (live only). The MPIN itself is in its own Keychain service, `vw.mpin.biometric`, with `requireAuthentication`. | No |
| `vw.practice.<slice>` | [`lib/api/demo/persist.ts`](../../mobile/src/lib/api/demo/persist.ts) | The sensitive Practice slices (`person`, `mpin`, `devices`) as `{ format, data }`, in chunks | No |
| `vw.kyc.openTry` | [`features/kyc/open-try.ts`](../../mobile/src/features/kyc/open-try.ts) | The open DigiLocker or ₹1 payment try (id, link, expiry), never a number | No |
| `vw.chunkedKeys` | `lib/storage.ts` (`OUTSIDE_KEY`) | JSON list of chunked keys outside the `vw.*` index (the Firebase session's `vwauth.*`), for the fresh-install wipe | Yes (an account wipe leaves those keys to Firebase's sign-out) |
| `vw.notifications` | [`features/account/settings/notificationPrefs.ts`](../../mobile/src/features/account/settings/notificationPrefs.ts) | JSON `{ reminders, tips, quiet, quietWindow }` | No |
| `vw.aiReports` | [`features/assistant/reports.ts`](../../mobile/src/features/assistant/reports.ts) | JSON array of up to 8 reports on assistant replies: `{ at, reason, tone, excerpt (100 chars) }` | No |
| `vw.aiTone` | [`features/assistant/tone.ts`](../../mobile/src/features/assistant/tone.ts) | `straight`, `hype` or `roast` | No |
| `vw.home.moves` | [`features/home/prefs.ts`](../../mobile/src/features/home/prefs.ts) | JSON `{ p: 0 \| 1 (auto-saves paused), s: { occurrenceKey: untilMs } }` | No |
| `vw.home.freshStart` | `features/home/prefs.ts` | Month key (for example `2026-11`) whose fresh-start card was dismissed | No |
| `vw.consents` | [`lib/consents.ts`](../../mobile/src/lib/consents.ts) | JSON `{ ai?, checks?, age? }`: assistant consent, "may an AI read my bills and IDs" (drives `x-ai-consent`), age confirmed | No |
| `vw.authServer` | [`lib/auth/firebase.ts`](../../mobile/src/lib/auth/firebase.ts) | The server address the signed-in login belongs to. The token goes nowhere else. | Wiped, then written back if a login is still signed in |
| `vw.tester` | [`features/tester/state.ts`](../../mobile/src/features/tester/state.ts) | JSON `{ sharing, id, done[], feedbackSent }` for the public test site | No |
| `vw.itemKeys` | `lib/storage.ts` (`INDEX_KEY`) | JSON array of every `vw.*` key written | Kept as the index, with the deleted keys removed |

### AsyncStorage

| What | Used by | Backend | Notes |
|---|---|---|---|
| `vw.install` | `lib/storage.ts` (`INSTALL_MARKER`) | **AsyncStorage** (goes with the app) | The fresh-install marker: `"1"`, or `"wiping"` while a fresh install's wipe runs. Never wiped. |
| `vw.bulk.practice` | [`mobile/src/lib/api/demo/persist.ts`](../../mobile/src/lib/api/demo/persist.ts) | **AsyncStorage** on phones, localStorage on web, through `getBulkItem` / `setBulkItem` in `storage.ts` | The saved Practice data: `{ format, slices: { state, proofs, checkouts, alerts } }`. The `state` slice's `invest` part holds the saved Core plan, the Core buys and, since 2026-11-24, `satellite` (this session's Satellite allocations; saves from before it lack it). Not secret: the typed name and email, the MPIN and the phone number are in the sensitive slices, and alerts carry no phone number or payee name. Removed on Delete account (through `onDeviceReset`); reset by Start Practice over. |
| `firebase:*` (older builds only) | `lib/auth/firebase.ts` | **AsyncStorage** | A session an older build kept here is copied to the secure store (`vwauth.*`, chunked) and each key deleted only once the Keychain gives the same value back. The web keeps `browserLocalPersistence`. |

The Firebase Auth session itself now lives in the secure store under `vwauth.<encoded key>` (chunked, listed in `vw.chunkedKeys`, not in the `vw.*` index), only when sign-in is on and Firebase is configured. Signing out removes it; a fresh iOS install wipes it.

### Web app storage (`src/`), for comparison

| Key | Where | Backend | Holds |
|---|---|---|---|
| `vw-theme` | [`src/components/shell.tsx`](../../src/components/shell.tsx), [`src/app/layout.tsx`](../../src/app/layout.tsx) | localStorage | `light`, `dark` or `system` |
| Firebase Auth session | [`src/components/identity/session.ts`](../../src/components/identity/session.ts) | The Firebase SDK default for `getAuth()` | Only when web sign-in is on |
| `vw-ai-consent` | [`src/components/ai-consent.tsx`](../../src/components/ai-consent.tsx) | localStorage | `yes` or `no`: may an AI read what this browser sends. Missing = not asked yet (sent as `no`). |
| `vw-device-id` | [`src/components/identity/device.ts`](../../src/components/identity/device.ts) | localStorage | This browser's device id (`web-<uuid>`), sent as `x-device-id`. Only with web sign-in on. |
| `vw-device-revoked` | `src/components/identity/device.ts` | localStorage | `"1"` after the server said this browser was signed out; the id is dropped at the next sign-out |
| `vw.kyc.digilocker` | [`src/components/identity/kyc-steps.tsx`](../../src/components/identity/kyc-steps.tsx) | sessionStorage | The DigiLocker request id this tab started (KYC steps flow) |
