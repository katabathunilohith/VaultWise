# Sign-in (identity)

People sign in with an email and password (Firebase Auth). The live app sends the sign-in with every request (`Authorization: Bearer <ID token>`), and the server works out whose wallet it is. Two sibling modules build on this one: `features/kyc` (Verify your ID) and `features/recovery` (Find my account, Recover with an ID). All three mark their touch points `// identity`.

## Turn it on

Put the Firebase web config in `mobile/.env` (same project as the server's `FIREBASE_PROJECT_ID`):

```
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com   # optional, this is the default
EXPO_PUBLIC_FIREBASE_PROJECT_ID=<project>
EXPO_PUBLIC_FIREBASE_APP_ID=...
```

In the Firebase console, turn on the Email/Password sign-in method. Restart Metro after changing `.env`.

The session survives restarts: the Keychain / Keystore on phones (`getReactNativePersistence` over the chunked secure store, features/protection; an older build's AsyncStorage copy is moved over), the browser's local storage on the web. On iOS the first launch after a fresh install wipes a session the last install left in the Keychain. The SDK refreshes the ID token itself. If the saved session takes more than 5 seconds to load, the app carries on with what Firebase has, so it never waits on a spinner.

A login belongs to the server address it was made or used on (Settings, Data source). Its token is only ever sent to that address (kept as `vw.authServer`), never to one typed in later, so it can't leak to another or a plain-http server. Changing the address while signed in signs out first ("You changed the server. Sign in again.").

## How the app behaves

| Situation | What people see |
|---|---|
| No Firebase config, or `SIGN_IN_ENABLED = false` | Exactly the prototype as before: no sign-in, no tokens, Firebase is never loaded. |
| Practice mode (any config) | Practice as before. Settings has "Sign-in and recovery", a preview of these screens where nothing signs in or is sent. |
| Live, signed out | Sign in, Create an account, Forgot your password, Find my account, Recover with an ID, and "Try Practice without an account". |
| Live, signed in, no wallet yet | Set up Vaultwise (`/setup`): the usual onboarding with the login's email filled in, or "Get my old account back". While a recovery request waits with no access yet, set-up shows that request instead of onboarding. |
| Live, signed in, wallet | The app as before (app lock, pending checkouts unchanged). Settings has Sign out. |
| Live, recovery waiting for a person | The app opens read-only, with a bar across the top and a Recovery status screen (see `features/recovery`). |
| The server stops accepting the sign-in (any request, /me or not, says 401 `signed_out`) | Signed out once, with the server's words on the sign-in screen. That includes a sign-in older than a device sign-out on the account, from a phone that isn't trusted: "A device was signed out of your account since you signed in here. Sign in again to continue." (refreshing the token can't fix it). `http.ts` and the assistant stream report it (`lib/api/signed-out.ts`); `startAuth()` signs out when someone is signed in, live, and the request went out since this sign-in. |
| Too many requests (429 `rate_limited`, GET /me counts too) | Never read as a sign-out. Queries don't retry a 4xx (429 included) by themselves, /me stays fresh for 30 s, and what's on screen stays; the server's words say when to try again. |
| The server wants sign-in but this app has no Firebase config | Errors say "This server needs sign-in, which this app isn't set up for." (Auto falls back to Practice.) |

Any sign-out (from Settings, from the server, or Firebase ending the session itself) clears what this phone keeps for the account (PIN, app lock, consents, support cases, Home choices) and keeps the device settings (appearance, haptics, data source). `signOutOfVaultwise()` runs the before-sign-out steps (alerts unregisters push) while the login still works, then Firebase signs out, then the phone is cleared: until the login is gone the PIN and lock stay, so a live account is never on screen unlocked, and no request goes out signed in with a new install id. If Firebase can't sign out, nothing is cleared and the error is thrown. Firebase's own "signed out" doesn't clear the phone a second time meanwhile. When the signed-in person changes, every cached answer is dropped. "Try Practice without an account" is remembered; the Practice preview of the sign-in screen has "Use my Vaultwise login" to go back (Data source: Auto).

Delete account with sign-in on closes the account (the server keeps records as the law requires) and signs the login out; the screens say "close", not "delete", and don't list money going back to the bank. Deleting the Practice account clears the phone's PIN and app lock, so a live login kept on the phone signs out too (keeping the device id), rather than stay open with no lock.

With sign-in on, a server that answers the start-up ping with 401 counts as reachable (it wants a sign-in). Without sign-in, Auto still falls back to Practice as before.

## Switch it off

Set `SIGN_IN_ENABLED` to `false` in `config.ts`. Nothing else changes: the prototype runs as before.

## Remove it completely

Delete `features/auth`, `features/kyc`, `features/recovery`, `lib/auth/firebase.ts`, `lib/api/identity-types.ts`, `lib/api/identity-ids.ts`, `lib/api/demo/identity.ts`, `lib/api/demo/identity-state.ts`, and the routes `app/auth/`, `app/setup.tsx`, `app/verify-id.tsx`, `app/recovery/`. Then remove each line marked `identity`:

| Where | What to remove |
|---|---|
| `src/app/_layout.tsx` | `startAuth`, `useSignInGate`, `useServerSignOut`, `signedOut` in the gate, `RecoveryChrome`, the `setup` / `auth` / `verify-id` / `recovery/*` screens and their guards (put `welcome` back directly under `needsOnboarding`) |
| `src/lib/api/http.ts` | `authHeaders()` and its use in `request()`; the `code` passed to `ApiError` |
| `src/components/ui/states.tsx`, `src/features/home/InlineError.tsx` | the on-hold state for `recovery_restricted` (`isRecoveryHold`, `ON_HOLD`) |
| `src/features/account/settings/ConnectionScreen.tsx` | the 401 check in the test, and signing out when the address changes |
| `src/features/account/settings/delete/*` | `closing` copy (`DeleteAccountScreen`, `DeleteReview`), and the live-only sign-out in `finishDeletion` |
| `src/features/account/onboarding/AboutYouStep.tsx` | the signed-in email and the Back target (`SETUP_HREF`) |
| `src/lib/api/client.ts` | `authHeaders()` in the assistant call; `...identityLive` |
| `src/lib/api/connection.ts` | the 401 line in `ping()` |
| `src/lib/api/errors.ts` | `ApiError.code`, `BY_CODE`, `isRecoveryHold`, `ON_HOLD` and their lines in `errorMessage` |
| `src/lib/api/identity.ts` | the methods (leave the empty `identityLive` if `client.ts` still spreads it) |
| `src/lib/api/types.ts` | the `MeAuth`/`MeKyc`/`MeRecovery` import and the `auth`, `kyc`, `recovery` fields of `MeOnboarded` and `MeNew` |
| `src/lib/api/demo/index.ts` | `withIdentity` in `me`; `...identityDemo` |
| `src/lib/api/demo/state.ts` | the `identity` field and `freshIdentity()` |
| `src/lib/api/demo/wallet.ts` | `assertPracticeIdVerified()` (the ID gate, with `assertPracticeCanMove()`) as `assertCanMove` |
| `src/lib/api/demo/vaults.ts`, `emergency.ts`, `invest.ts`, `index.ts` | `assertPracticeIdVerified()` on withdraw, deposits (and a new vault's first deposit), emergency, Core buys and plans, Satellite allocations, simulate and sweep: the server's `kyc` column (`tests/contract/vectors/money-actions.json`) |
| `src/lib/api/keys.ts` | `kyc` and `recovery` keys (added by the lead) |
| `src/features/home/TodoCards.tsx` | `useIdentityTodo` and its card |
| `src/features/account/settings/SettingsHome.tsx` | the identity rows, `useAuthSettings`, `useRecoveryPending`, and the signed-in branch of Export my data |

No stored data needs undoing on the phone: the device id (`vw.deviceId`) and Firebase's own session go with the next Delete account or app reinstall.

## Known gaps

- Export my data with sign-in on: the web preview downloads the file with the token; on a phone there's no way to save a file without adding `expo-file-system` / `expo-sharing`, so Settings says to get the export from Vaultwise on the web.
- Email verification isn't asked for. The server records whether the new login's email is verified and shows it to the person deciding a recovery request.
