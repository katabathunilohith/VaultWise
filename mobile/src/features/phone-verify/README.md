# Phone number and codes (phone)

A verified phone number, added with a 6-digit code, is where codes go when a new phone is trusted or a forgotten MPIN is reset ([plan 06](../../../../docs/plans/06-devices-alerts-otp.md), contract in [contracts.md](../../../../docs/plans/contracts.md#devices-alerts-and-otp-plan-06)). This module owns the code entry those flows share.

## What people see

- **Settings → Security → Phone number** shows the verified number masked (`+91••••••3210`, as `/me` sends it) with Verified, or Not added. It opens **Add (or Change) your phone number** (`app/settings/verify-phone.tsx`, full-screen modal): the number with the country code (pre-filled from the person's country), **Send code** (`POST /otp/send`, purpose `phone_verify`), the code (`POST /otp/verify`), then **the MPIN**, then `POST /me/phone` with the code's token and the MPIN. Adding a first number and replacing one both need the MPIN (the server always checks it, whatever `MPIN_ENFORCED` says), because the number receives the codes that trust phones and reset the MPIN. The MPIN step is the MPIN prompt itself (`MpinPanel`, handed in by the route because features/mpin already uses this module's code step), so wrong tries and a lock read as everywhere else. A wrong MPIN keeps the token: the next try sends the same token, no new code. A token that ran out (`verification_invalid`) goes back to the code step. Replacing a number from a phone that isn't trusted is refused before the MPIN (`device_untrusted`, already at Send code). Done says a new number can't reset the MPIN for 72 hours.
- **The code step** (`OtpCodeScreen`), also used by Trust this phone and Forgot your MPIN: where the code went (`sentTo`), a 6-digit field that fills itself from the text where the phone offers it (`textContentType="oneTimeCode"`, `autoComplete="one-time-code"`), six digits check themselves, **Send a new code** after 30 s, and what went wrong in words with an icon.
- **Test mode**: when the server (in `OTP_MODE=test`) or Practice returns `testCode`, a note says **"Test mode code: 123456"** with **Use this code**, so testers can carry on without a text.
- **No verified number** for a flow that needs one (`/me` says so, or the server answers 409 `phone_required`): `PhoneNeededScreen` explains and opens Add your phone number; the flow carries on when the person comes back.

## Server answers

`errors.ts` reads them by `code` in one table (`CODES`), so a renamed code is a one-line change: `otp_wrong` (with `triesLeft`), `otp_expired` / `otp_exhausted` / `otp_used` / `otp_not_found` / `verification_invalid` (send a new code), `otp_rate_limited` (with `retryAt`), `phone_required`, `phone_invalid`, and `phone_recently_changed` (with `allowedAt`: for 72 hours after the verified number was added or changed it can't reset the MPIN; Forgot your MPIN says until when). Anything else shows the server's message through `errorMessage()` (`otp_unavailable`, `otp_send_failed` and `device_untrusted` have plain fallbacks there).

## Practice

`lib/api/demo/devices.ts`: the code is always `123456` and comes back as `testCode`; 5 minutes, 3 tries, 5 sends an hour, a new code replaces the last one, tokens are single-use and last 10 minutes. Keeping the number needs the MPIN (the `phone_change` action, checked like the server's, and a wrong MPIN keeps the token), and the 72-hour reset hold counts from when the number was added or changed (proving the same number again doesn't restart it). The checks run in the server's order (a trusted phone and the hold, then the number, then the send limits). Practice starts with no phone number. Only the masked number is kept, with a one-way key of the whole number to tell "the same number" apart, in a `sensitive` slice (secure storage).

## Files

| File | What it holds |
|---|---|
| `config.ts` | `PHONE_VERIFY_ENABLED`, the resend wait, the route |
| `useOtp.ts` | Send, verify, resend timer, the answers |
| `OtpCodeScreen.tsx` | The shared code step |
| `PhoneVerifyScreen.tsx` | Add or change the number: number, code, MPIN (the panel is a prop, `PhoneMpinPanel`) |
| `PhoneNeeded.tsx` | "Add your phone number first" |
| `phone.ts` | Dialling codes, cleaning and checking a number, pure |
| `errors.ts` | `readOtpError`, pure |

## Switch

`PHONE_VERIFY_ENABLED` in `config.ts`. Off: no Phone number row. Trust this phone and Forgot your MPIN still use the code step against an account that already has a number.

## Touch points outside this folder

| File | What |
|---|---|
| `src/app/settings/verify-phone.tsx`, `src/app/settings/_layout.tsx` (`// devices`) | The route, a full-screen modal; hands `MpinPanel` from features/mpin to the screen |
| `src/features/account/settings/SettingsHome.tsx` (`// devices`) | Phone number row |
| `src/features/devices/TrustDeviceScreen.tsx`, `src/features/mpin/ResetMpinScreen.tsx` | Use `useOtp`, `OtpCodeScreen`, `PhoneNeededScreen` |
| `src/lib/api/security.ts` | `sendOtp`, `verifyOtp`, `attachPhone(token, pin)` |
| `src/lib/api/errors.ts` | Plain fallback for `phone_recently_changed` |

## Known limits

- The number is typed with its country code; there's no country picker.
- Codes by SMS need the server's Twilio settings; until then a live server either runs in test mode (codes on screen) or answers 503 `otp_unavailable`.
