# ID verification (KYC module)

Checks a government ID before money can leave a wallet. The default **practice** provider is a good-faith
automated check plus a person. **It is not official KYC.** Read "Official KYC in India" before any real launch.

## Switch and config

| Variable | Effect |
|---|---|
| `KYC_ENFORCED` | New sign-ups start `kyc_status = 'pending'` and can't move money out until verified. Default on in firebase mode, off in prototype mode (set `"true"` to try it there). `"false"` keeps today's simulated auto-verify **and** turns off the money-out gate. |
| `KYC_PROVIDER` | `practice` (default). `external` is the slot for an official provider (not implemented). |
| `IDENTITY_SECRET` | HMAC key for ID numbers. Required in firebase mode and in production (500 `server_config` until set). Prototype mode and tests: a fixed dev key and a console warning. Use a long random value from a secret manager. Changing it breaks matching for older records (recovery, duplicate checks). |
| `GROQ_API_KEY` / `GROQ_VISION_MODEL` | The practice provider reads the card with the vision model. Without it every check goes to a person. |

Switch off: `KYC_ENFORCED=false`. Seeded demo users, tests and `createUser()` default to `verified`, as before.

## What is stored

`kyc_records (id, user_id, doc_type, id_last4, id_hash, name_on_doc, dob, status, provider, checks, reasons, file_path, decided_by, decided_at, created_at)`,
created on first use. **Never the full number**: last 4 + `HMAC-SHA256(IDENTITY_SECRET, "<docType>:<normalised number>")`.
Numbers are never logged or written to the audit log (and `lib/groq.ts` strips the model's failed output and long digit
runs from provider errors before logging). The ID photo is stored like proofs, in `DATA_DIR/uploads/kyc_<id>.<ext>`.

**Photo retention.** A rejected check's photo is deleted at once (the row keeps last 4, checks and the decision).
Verified and waiting checks keep it, because a regulated entity must keep identity records: in India the PMLA rules and
the RBI KYC Direction require records of identity for at least five years after the relationship ends. Confirm the
period for your licence with counsel, then add a job that deletes photos of closed accounts once it has passed.

**Parallel submissions.** `submitKyc` reserves a `pending` row before it reads the photo, so a second submission at the
same time answers 409 `kyc_in_review` and counts toward the daily limit. A failed upload or provider call removes the row. An HMAC of a 12-digit Aadhaar number can be brute-forced
by anyone who has the secret, so treat `IDENTITY_SECRET` like a database password.

`users.kyc_status` follows the latest record (`pending | needs_review | verified | rejected`); `kyc_level` is 2 when verified,
1 while checking, 0 when rejected.

## ID types (ids.ts)

| Market | Types | Format |
|---|---|---|
| India | `aadhaar` | 12 digits, not starting 0/1, Verhoeff check digit |
| | `pan` | `^[A-Z]{5}[0-9]{4}[A-Z]$` |
| | `passport` | `^[A-Z][0-9]{7}$` |
| | `driving_licence` | `SS RR YYYY NNNNNNN` (15 characters, spaces or hyphens allowed) |
| | `voter_id` | `^[A-Z]{3}[0-9]{7}$` |
| Others | `passport`, `national_id` | 5 to 20 letters and digits |

## The practice provider

`analyse.ts` (shared with account recovery): vision model extracts `{ is_id_document, doc_type, name, dob, id_number, expiry, legibility }`;
the typed and the read number must have a valid format and checksum and agree; the name must match the account name
(case, spacing, honorifics, order and initials ignored); expired cards, low legibility, editing software in EXIF and
localised compression anomalies (ELA, from `src/lib/verification/forensics.ts`) all send the check to a person. Then the
same `id_hash` on another open account → `needs_review`. Only a clean, confident result is `verified`; the provider never
rejects. AI unavailable → `needs_review`. The model is told that cards marked SAMPLE or SPECIMEN are not real IDs,
so Practice sample cards go to a person.

## API

| Route | Body | Answer |
|---|---|---|
| `GET /api/v1/kyc` | | `{ status: "not_started" \| "pending" \| "needs_review" \| "verified" \| "rejected", docType, idLast4, reasons: string[], updatedAt }` |
| `POST /api/v1/kyc` | multipart `docType`, `file`, `idNumber?` | 201, same shape. Errors: 400 `invalid_id`, `doc_type_not_accepted`, `file_required`; 409 `kyc_done`, `kyc_in_review`; 429 `rate_limited` (5 a day); 413/415 bad file. |
| `GET /api/v1/admin/kyc` | | `{ queue: [...], recent: [...] }` (checks, reasons, masked number, name on card) |
| `POST /api/v1/admin/kyc/[id]` | `{ decision: "verified" \| "rejected", note }` | `{ ok: true, status }`. A rejection's note is shown to the customer. 409 `already_decided`. |
| `GET /api/v1/admin/kyc/[id]/file` | | the ID photo (admins only) |

## Official KYC in India

Vaultwise on its own cannot do official KYC. In India, KYC for payments, wallets and deposits is done by a
**regulated entity** (a bank, NBFC or RBI-authorised prepaid payment instrument issuer) under the PMLA and the RBI
Master Direction on KYC, and for investments under SEBI's KYC rules (KRAs). A fintech that is not itself regulated
works through a partner bank or PPI issuer and uses its KYC, usually through a licensed provider. In practice:

- **DigiLocker** (consent-based, documents count as originals): integrate through a partner with DigiLocker access,
  such as **Setu** or **Digio**. The customer signs in to DigiLocker, consents, and the partner returns the issued
  Aadhaar (masked XML), PAN or driving licence to you.
- **Verification APIs**: **HyperVerge**, **IDfy** or **Signzy** check PAN against the Income Tax database, run OCR and
  face match on documents, liveness and video KYC (V-CIP), and can pull DigiLocker documents.
- **Aadhaar e-KYC** (OTP or biometric) is only available to entities licensed by UIDAI as **AUA/KUA**, or through one
  that is. Everyone else may use Aadhaar offline verification (the customer's own XML or Secure QR) with consent, and
  must not store the full Aadhaar number (masked or tokenised only). Regulated entities also upload records to CKYC.

Get legal advice for the exact obligations of your licence and partner. Keep this module's rules either way:
never store a full number, mask everywhere, and let a person decide anything unclear.

## Plugging in an official provider

1. Implement `KycProvider` (types.ts) in `providers/external.ts`:
   `verify({ user, docType, file, idNumber })` calls the provider and returns
   `{ status, number, nameOnDoc, dob, checks, reasons, reference }`. Return the number only so this module can hash it
   and keep the last 4; never persist the provider's raw response if it contains the full number.
2. Set the provider's credentials in env (for example `SETU_CLIENT_ID`, `SETU_CLIENT_SECRET`, `SETU_PRODUCT_INSTANCE_ID`,
   or `HYPERVERGE_APP_ID`, `HYPERVERGE_APP_KEY`) and `KYC_PROVIDER=external`.
3. Consent and redirect flows (DigiLocker) are asynchronous: return `status: "pending"` with the provider's `reference`
   and a redirect URL in `checks`, open that URL in the app, and add a callback route (for example
   `POST /api/v1/kyc/callback`, verified with the provider's signature) that finds the record and calls
   `setKycDecision()` plus `UPDATE users SET kyc_status/kyc_level`. Add a `reference` column to `kyc_records` for the lookup.
4. Keep `practice` for Practice mode and tests (`setKycProvider()` swaps providers in tests).

## Touch points outside this folder (marked `// identity`)

- `src/lib/users.ts`: `createUser({ kycStatus })`.
- `src/app/api/v1/onboarding/route.ts`: new sign-ups start pending when `KYC_ENFORCED` says so.
- `src/app/api/v1/me/route.ts`: `kyc: { status, docType?, idLast4? }`.
- `src/lib/auth/session.ts`: the `kyc: true` gate. Routes: `src/app/api/v1/kyc`, `src/app/api/v1/admin/kyc/**`.
- `src/lib/recovery` reuses `analyse.ts`, `ids.ts`, `secret.ts` and `verifiedHolder()`.

## Remove

Delete this folder and the `kyc` and `admin/kyc` routes, drop `kyc` from `/me`, and remove `kycStatus` from onboarding.
The recovery module depends on this one; remove it first.
