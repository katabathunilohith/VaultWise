# Sign-in (identity module)

Per-request sign-in with Firebase ID tokens. Without configuration the server stays in **prototype mode**:
one wallet per server, the first user is the customer, no sign-in. Every existing test runs in that mode.

## Switch

| Variable | Effect |
|---|---|
| `FIREBASE_PROJECT_ID` | Set: **firebase mode**. Every API call must send `Authorization: Bearer <Firebase ID token>`. Unset: prototype mode. |
| `ADMIN_EMAILS` | Comma list. In firebase mode only these signed-in, email-verified people may call `/api/v1/admin/*` and `/api/v1/audit/*`. Prototype mode leaves admin routes open, as before. |
| `IDENTITY_SECRET` | HMAC key for ID numbers and recovery tokens. **Required** in firebase mode and when `NODE_ENV=production` (calls that need it answer 500 `server_config`); prototype mode and tests fall back to a dev key with a warning. |
| `TRUST_PROXY_HOPS` | How many trusted proxies append to `x-forwarded-for`. Unset/0: that header is ignored for rate limits (it is client-controlled); `cf-connecting-ip` / `x-real-ip` are used instead. |
| `KYC_ENFORCED` | New sign-ups start with KYC `pending` (firebase mode unless `"false"`, prototype mode only if `"true"`). `"false"` also turns off the money-out ID gate. See `src/lib/kyc/README.md`. |

Switch off: unset `FIREBASE_PROJECT_ID`. Identities stay in the database but are ignored.

## How a request is resolved

1. `handle()` (lib/api.ts) runs every route inside `withRequest(req)` (context.ts), so lib code can read the
   request's headers. Outside a route it falls back to `await headers()` from `next/headers`.
2. `session()` (session.ts): prototype → `currentUser()`. Firebase → `verifyIdToken()` (verify.ts, jose against
   Google's securetoken JWKS: RS256, issuer `https://securetoken.google.com/<project>`, audience `<project>`,
   non-empty `sub`, `auth_time` not in the future) → `identities` row → wallet.
3. `customer(opts)` (lib/api.ts → `resolveCustomer`) applies the gates:

| Situation | Status | Body |
|---|---|---|
| No token or invalid token | 401 | `{ error: "Sign in to continue.", code: "signed_out" }` |
| Signed in, no wallet (or wallet closed, or identity disabled) | 404 | `{ error: "You don't have a wallet yet. Finish setting up first.", code: "no_wallet" }` (prototype keeps its old 401 text, now with `code: "no_wallet"`) |
| Identity `recovery_pending` on any route that doesn't opt in with `recovery: true`, or any write | 403 | `{ code: "recovery_restricted", error: "Your account is being checked. Money can't move until a person confirms it's you." }` |
| `kyc: true` and `kyc_status !== "verified"` | 403 | `{ code: "kyc_required", error: "Verify your ID to move money." }` |
| Admin route, not an admin | 403 | `{ code: "admin_only", error: "Only the operations team can do this." }` |

`access` defaults to `"write"`. GET routes (and the read-only POSTs `emergency/preview` and `assistant`) pass
`{ access: "read" }`. Money-out routes pass `{ kyc: true }`.

**Recovery access** (a claim whose automated checks passed, waiting for a person) is a short allowlist, opted in with
`customer({ access: "read", recovery: true })`: `GET /api/v1/dashboard` and `GET /api/v1/vaults`. `GET /api/v1/me` shows
the account's first name and masked email only, and `/api/v1/recovery/claim` works for any signed-in person. Everything
else, reads included (export, activity, vault detail, files, insight, assistant, KYC, wallet), answers 403 `recovery_restricted`.

**PATCH /api/v1/me** (firebase mode): changing `pin` needs `currentPin` (400 `current_pin_required`, 403 `pin_mismatch`).
In any mode the `name` is locked once a real ID check verified it (403 `name_locked`); prototype users verified by the
simulated check keep editing it, as before.

**Onboarding** (firebase mode) answers 409 `claim_pending` while the sign-in has a recovery claim waiting.

## Tables (created on first use, per database)

- `identities (uid PK, user_id, email, provider, status active|recovery_pending|disabled, created_at, updated_at)`.
  An identity with `user_id = NULL` is signed in with no wallet.
- `users.closed_at` (column added by `ensureIdentityTables`): set when firebase-mode `/api/v1/reset` closes an account.

## Files

- `config.ts` mode and switches, `verify.ts` token verification (`setVerificationKey()` lets tests sign their own tokens),
  `context.ts` request headers and client keys, `identities.ts` table and helpers, `session.ts` resolution and gates,
  `account.ts` onboarding bind and account close.

## Touch points outside this folder (marked `// identity`)

- `src/lib/api.ts`: `handle()` keeps request headers; `customer()` calls `resolveCustomer`; `admin()`; `code` in error JSON.
- `src/lib/users.ts`: `HttpError.code`; `createUser({ kycStatus })`; `User.closed_at`.
- `src/app/api/v1/me/route.ts`: `auth`, `kyc`, `recovery` in GET.
- `src/app/api/v1/onboarding/route.ts`: binds the identity, email from the token, KYC pending when enforced.
- `src/app/api/v1/reset/route.ts`: firebase mode closes the account instead of wiping the server.
- `src/app/api/v1/samples/[key]/route.ts`, `proofs/[id]/file/route.ts`: request-scoped user (admin or owner for proof files).
- `src/app/api/v1/admin/**`, `audit/[userId]`: `await admin()`.
- Every other route under `src/app/api/v1`: `customer({ access: "read" })` / `customer({ kyc: true })` options.

## Remove

Delete this folder, `src/lib/kyc`, `src/lib/recovery` and their routes; in `api.ts` make `customer()` call
`requireUser()` again and `admin()` return `REVIEWER`; restore `me`, `onboarding`, `reset`, `samples/[key]` and
`proofs/[id]/file` to use `currentUser()` / `requireUser()`. The `access`/`kyc` options can stay (they do nothing).
