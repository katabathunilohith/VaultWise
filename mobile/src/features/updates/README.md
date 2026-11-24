# Update prompt ("A new version is ready")

Over-the-air updates (EAS Update) download in the background but only apply on the next cold start. This module tells people when one is waiting and lets them apply it straight away.

## How it works

- `useUpdatePrompt()` reads `useUpdates()` from expo-updates. When `isUpdatePending` is true (an update has downloaded), `UpdateChrome` shows a banner across the top of the main tabs: "A new version is ready", with **Restart** (`Updates.reloadAsync()`) and a close button that hides it until the next restart.
- The banner only shows on the main tabs, never over a flow, PIN pad, sheet or sign-in screen, so a restart can't cut off something half done. Like the recovery bar, it sits above the app and the app measures its top inset from below it.
- expo-updates checks once at launch by itself. On top of that, each time the app comes back to the foreground the hook checks again and downloads any update, at most every 30 minutes (`CHECK_EVERY_MS`), and not while one is already waiting.
- If Restart fails, the banner says to close and reopen the app; the update still applies on the next cold start.
- It does nothing in Expo Go, development builds, on the web, or when expo-updates is disabled (`UPDATES_ACTIVE` in `config.ts`). There the wrapper renders the app untouched and the Updates API is never called.

## Switch

`UPDATES_PROMPT_ENABLED` in `config.ts`. Off: no banner and no foreground checks. Updates still download at launch and apply on the next cold start.

## Test it

Only a release build can: the APK (`npm run build:apk`). Install it, publish an update with `npm run update:apk -- "Test update"`, then send the app to the background and back (or reopen it). Once the update has downloaded, the banner appears on the main tabs; Restart opens the new version. Settings → About shows the running update.

## Remove it

Delete this folder, then remove each line marked `updates`:

| Where | What to remove |
|---|---|
| `src/app/_layout.tsx` | the `UpdateChrome` import and the `<UpdateChrome>` / `</UpdateChrome>` lines around `RecoveryChrome` |
| `CHANGELOG.md` | the note, if it hasn't been released yet |
