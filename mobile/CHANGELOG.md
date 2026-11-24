# Changelog

What changed in each version of the Vaultwise app. Add notes under **Unreleased** as you go. When you release, rename it to the new version and date.

Version numbers follow `MAJOR.MINOR.PATCH`:

- **PATCH** (0.1.0 → 0.1.1): fixes only.
- **MINOR** (0.1.0 → 0.2.0): new features.
- **MAJOR** (0.x → 1.0.0): the first real launch, or a change that breaks old data or flows.

The version lives in `app.json` (`expo.version`). Build numbers count up by themselves on every APK and store build.

## Unreleased

Nothing yet.

## 0.2.0 (2026-11-24)

The version in `app.json`. Tag `v0.2.0` on the commit that releases it. The fingerprint runtime ignores the version, so a 0.1.0 APK built from the same native code still gets this as an over-the-air update.

- Over-the-air updates through EAS Update, with a channel for each build profile.
- The About screen shows the version, channel and update, for bug reports.
- Practice data is saved on the phone (and in the browser), so vaults and withdrawals survive closing the app.
- Settings → Start Practice over puts back the sample account.
- Tester mode for the public test site: an opt-in Home card, three tasks and a feedback form.
- "A new version is ready" banner on the main tabs, with Restart, once an update has downloaded. The app also checks for updates when you come back to it, at most every 30 minutes.
- Native packages for later updates: screenshot blocking (expo-screen-capture), notifications (expo-notifications) and a root check (expo-device).
- **MPIN on every money move.** A sheet asks for the 6-digit MPIN before a withdrawal, wallet move, cash-out, emergency request, checkout, investment or limit raise; the server checks it. Wrong tries show how many are left, and a lock shows when it ends. "Forgot your MPIN?" resets it with a texted code. Face ID / fingerprint can approve payments (live only). Practice MPIN: 246810.
- **Phone protection.** App lock on by default once there's a PIN, and after 5 idle minutes. Screenshots and screen recording blocked on screens with money or a PIN pad; the iOS app switcher shows a blurred cover. Hide balances on Home (tap to peek for 30 seconds). A warning on rooted phones. A stronger PIN hash, the sign-in kept in the Keychain / Keystore, and longer waits after wrong PINs (the 10th in a row signs out, or offers Start Practice over). Release builds only talk to https servers.
- **Your devices.** See the phones signed in to your account, sign out the others, and trust a new phone with a texted code and your MPIN. A new phone can send only small amounts until it's trusted.
- **Alerts.** A bell on Home with an inbox of money moves and security events, and push notifications on live data.
- **Verify your phone number** with a texted code (needed for trusting a phone and resetting the MPIN).
- **ID check by steps** (PAN, Aadhaar through DigiLocker, bank account) when the server asks for it.
- **The online tester build** (`tester-live` profile and `npm run update:tester-live`): live data and sign-in against the online server, with the ID check and recovery off.
- Practice now saves its new parts (alerts, devices, the MPIN), keeping names and the MPIN in secure storage.
- **MPIN for investing plans.** Starting a monthly Core plan or putting more into it asks for the MPIN (lowering or stopping doesn't). Satellite's "Turn on Practice" and "Set aside more" walk through the risk statements, the amount and the MPIN.
- Practice applies the server's ID check to every money move (withdraw, emergency, investing, deposits, simulate, sweep), in the server's order: ID, then the new-phone cap, then the MPIN. Add money shows "Verify your ID" when a deposit is refused for it.
- Practice now matches the server on the emergency Tier 2 order (by category, oldest vault first) and on how payday is worked out (the last 7 paydays).
- Tests: Jest (`npm test`) with unit tests, and contract tests that run the same rule tables (`tests/contract/vectors`) against the phone and the server, so the two can't drift apart unnoticed.
- Fixed after review: an offline wrong-PIN lockout could open a live account unlocked; signing out briefly showed the app unlocked; a money move could still go through after its PIN sheet said "cancelled"; a timed-out emergency request, withdrawal, investment or limit change could be sent twice; a successful payment could change the phone's unlock PIN to an unchecked PIN; moving the clock back could freeze the wrong-PIN wait.

## 0.1.0 (2026-11-22)

- First tester release: vaults, proof checks, emergency money, wallet, Pay with Vaultwise and investing, all in Practice mode.
