# Account recovery (recovery module)

Three ways back in, from easiest to hardest:

1. **Forgot password**: `POST /api/v1/recovery/reset` sends Firebase's password-reset email.
2. **Forgot which email**: `POST /api/v1/recovery/find` looks the account up by its verified ID and shows a masked email.
3. **Lost the sign-in completely**: sign in with a new account, then `POST /api/v1/recovery/claim` with the same ID.
   The new sign-in gets read-only access, the old email is told, and a person approves or rejects.

## Switch and config

| Variable | Effect |
|---|---|
| `RECOVERY_ENABLED` | `"false"` turns off find, reset and claim (404 `recovery_off`). On by default. |
| `FIREBASE_WEB_API_KEY` | Lets the server send reset emails (Identity Toolkit `accounts:sendOobCode`, `PASSWORD_RESET`). Unset: nothing is sent and a warning is logged; clients can still call Firebase's `sendPasswordResetEmail` directly. |
| `IDENTITY_SECRET` | Also signs `findToken`s (see `src/lib/kyc/README.md`). Required in firebase mode. |
| `TRUST_PROXY_HOPS` | Trusted proxies in front of the server. Only then is `x-forwarded-for` used (its right-most trusted hop). Otherwise the client IP comes from `cf-connecting-ip` or `x-real-ip`. |

Claims need firebase mode (`FIREBASE_PROJECT_ID`). In prototype mode reset answers `{ ok: true, simulated: true }`,
`GET /claim` answers `{ claim: null }` and `POST`/`DELETE /claim` answer 400 `not_available`.

## API

| Route | Auth | Body | Answer |
|---|---|---|---|
| `POST /recovery/reset` | none | `{ email }` or `{ findToken }` | Always `{ ok: true }` (no account enumeration); prototype adds `simulated: true`. 400 `email_required`; 429 `rate_limited` (5 an hour per client). |
| `POST /recovery/find` | none | multipart `docType`, `file?`, `idNumber?` (or JSON without a file) | `{ found, maskedEmail?, canReset, findToken? }`. `findToken` lasts 10 minutes and works only with `/reset`. 400 `invalid_id`, `id_number_needed`; 429 `rate_limited` (5 an hour per IP and per `x-device-id`). Every try is audited (`recovery.find_attempt`, client key hashed, no number). |
| `POST /recovery/claim` | new sign-in, no wallet | multipart `docType`, `file`, `idNumber?` | 201 `{ claim }`. 404 `no_match`; 409 `has_wallet`, `claim_pending`; 400 `invalid_id`, `id_number_needed`, `file_required`, `not_available`; 429 `rate_limited` (3 a day per sign-in and client). |
| `GET /recovery/claim` | signed in | | `{ claim: ClaimView \| null }` (latest claim by this sign-in) |
| `DELETE /recovery/claim` | signed in | | `{ claim }` cancelled; 404 `no_claim` |
| `GET /admin/recovery` | admin | | `{ queue: [...], recent: [...] }` with checks, both emails, every sign-in on the account |
| `POST /admin/recovery/[id]` | admin | `{ decision: "approved" \| "rejected", note }` | `{ ok: true, claim }`; 409 `already_decided` |
| `GET /admin/recovery/[id]/file` | admin | | the ID photo |

`ClaimView = { id, status: "pending" | "approved" | "rejected" | "cancelled" | "expired", access: "read_only" | "after_approval", docType, idLast4, notifiedEmail (masked), reasons, createdAt, expiresAt, decidedAt }`.

### Rate limits (limits.ts)

Each try counts against every key the client has, with a strict cap per key, and against a generous server-wide cap per
route, so rotating headers can't remove the limit and a client with no IP header can't lock everyone else out.

| Route | Per key | Server-wide | Window | Keys |
|---|---|---|---|---|
| find | 5 | 300 | 1 hour | IP, `x-device-id` |
| reset | 5 | 500 | 1 hour | IP, `x-device-id` |
| claim | 3 | 200 | 1 day | sign-in uid, IP, `x-device-id` |

The IP is `cf-connecting-ip`, else `x-real-ip`, else (only with `TRUST_PROXY_HOPS`) the right-most trusted `x-forwarded-for` hop.
`x-device-id` is client-chosen, so it only ever adds a limit.

## Rules

- A claim matches only a **verified** KYC record (same ID type and number, by HMAC) on an open account.
- **Provisional access** (`access: "read_only"`) only when the card itself backs the claim: the vision model read it,
  it is the chosen ID type, legible and not expired, the number read from the card is the matched number (and equals the
  typed one, if typed), the name fits the account, and there is no sign of editing. Then the sign-in becomes
  `recovery_pending`: `GET /api/v1/me` (first name and masked email only), `GET /api/v1/dashboard` and `GET /api/v1/vaults`
  work; every other route, reads included, answers 403 `recovery_restricted`. `/me` shows `auth.access = "recovery"` and
  `recovery: { claimId, status, createdAt }`.
- **Otherwise** (`access: "after_approval"`: AI unavailable, unreadable card, typed number differs, edit signs, name
  mismatch) the claim still goes to a person, but the sign-in is **not bound** and sees nothing of the account until approval.
- One pending claim per sign-in (checked in the transaction and by a unique index): 409 `claim_pending`. Onboarding is
  refused with `claim_pending` while a claim waits.
- **Approve**: the new identity becomes `active`, every older identity for the wallet becomes `disabled`, other pending
  claims for that wallet are rejected, and the wallet's contact email becomes the new sign-in's email.
- Approval answers 409 `claimant_has_wallet` if the claimant's sign-in is tied to a different open wallet.
- **Reject, cancel or 7 days with no decision** (`expired`): the claimant is unbound and keeps no access, and the claim's
  ID photo is deleted (approved claims keep theirs as an identity record; see the KYC README on retention).
  Expiry is lazy: checked when the claimant makes a request and whenever the queue or a claim is read.
- Automated checks (shared with KYC, `src/lib/kyc/analyse.ts`) inform the reviewer; a person always decides.

## Notifications (notify.ts)

There is no email provider in this project. `notifyAccount()` writes a log line (masked address) and an audit entry
(`notice.recovery_started`, `notice.recovery_approved`, ...), which the ops console's audit view shows. To send real
email, implement `deliver()` in `notify.ts` with your provider (Resend, SES, SendGrid, Postmark) and its key from env.
Keep the audit entry.

## Tables (created on first use, per database)

`recovery_claims` (as in the build plan, plus status `expired`) and `recovery_attempts (bucket, client_key hashed, ts)`.

## Touch points outside this folder (marked `// identity` / `// recovery`)

- `src/lib/auth/session.ts`: settles an expired claim while resolving a `recovery_pending` identity.
- `src/lib/auth/account.ts`: closing an account ends its pending claims.
- `src/app/api/v1/me/route.ts`: `recovery` in GET. Routes: `src/app/api/v1/recovery/**`, `src/app/api/v1/admin/recovery/**`.

## Remove

Delete this folder and its routes, the `settleExpiredClaimFor` call in `auth/session.ts`, the claims block in
`auth/account.ts` and `recovery` in `/me`. Identities stuck in `recovery_pending` should then be unbound:
`UPDATE identities SET user_id = NULL, status = 'active' WHERE status = 'recovery_pending'`.
