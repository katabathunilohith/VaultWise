# 02. Prepare the one-time APK rebuild

**Status:** built 22 Nov 2026 (phone only; this plan has no server half); waiting for the owner to build and share the APK · **Owner:** Shaik (build), Claude (code) · **Size:** S

## Goal

Testers' current APK predates over-the-air updates, so they must install one more APK. Put everything native that later steps need into this build, so steps 3 to 7 ship as updates with no second reinstall.

## Scope

- **In:** an "update ready" prompt; the native packages for screenshot blocking (plan 04), notifications (plan 06) and a root check (plan 04); building and sharing the APK.
- **Out:** using those packages. They're installed and switched off until their plan.

## Design

- **Update prompt module** (`mobile/src/features/updates/`): a small banner fed by `useUpdates()` from `expo-updates`. When `isUpdatePending` is true it says "A new version is ready" with a **Restart** button that calls `Updates.reloadAsync()`. It also checks again when the app returns to the foreground, at most every 30 minutes. It does nothing in Expo Go, development builds or on the web. Switch: `UPDATES_PROMPT_ENABLED` in its `config.ts`.
- **Native packages:** install each with `npx expo install`, after reading its SDK 58 page:
  - `expo-screen-capture`: blocks screenshots and hides the app-switcher preview on Android.
  - `expo-notifications`: local alerts now, push later. Remote push on Android needs Firebase Cloud Messaging credentials, which plan 06 sets up.
  - Root and jailbreak check: use `expo-device`'s check if SDK 58 still provides it, otherwise pick a maintained library that works with development builds. Decide while doing this step and record the choice here.
- Each package is wrapped in a tiny adapter in `mobile/src/lib/` (for example `lib/device-integrity.ts`), so features never import the package directly and it can be swapped later (dependency inversion).

## Changes

| File | Change |
|---|---|
| `mobile/src/features/updates/*` | **New.** Banner, hook, config, README |
| `mobile/src/app/_layout.tsx` | Mount the banner (marked `// updates`) |
| `mobile/package.json`, `app.json` | The three native packages and any config plugins they need |
| `mobile/src/lib/screen-capture.ts`, `lib/device-integrity.ts`, `lib/notify.ts` | **New.** Adapters, unused until their plans |
| `mobile/CHANGELOG.md` | 0.2.0 notes |

## Tests

- Typecheck, lint, `npm run doctor`, and `npx expo export --platform android`.
- After building: install on an Android phone; Profile → About shows `apk`. Publish a trivial update (`npm run update:apk -- "Test update"`), open the app twice and see it applied, then check the banner offers a restart.

## Acceptance criteria

- [ ] Testers install one APK, and every later change reaches them without reinstalling.
- [ ] The banner appears when an update has downloaded, and Restart applies it.
- [ ] The three native packages are in the build but change nothing yet.

## Risks and rollback

- A package that needs native configuration can fail the build. Fix it, or leave it out and accept a second reinstall when its plan arrives.
- **Rollback:** testers keep the previous APK; nothing on the server depends on this.

## What was built (phone)

Built 22 November 2026. Where each piece is described: the update banner in [app-structure.md](../mobile/app-structure.md#versioning-and-over-the-air-updates), the adapters in [data-layer.md](../mobile/data-layer.md#helpers), and what uses them in [phone-security.md](../features/phone-security.md) (plan 04) and [devices-alerts-otp.md](../features/devices-alerts-otp.md#on-the-phone) (plan 06).

### Files

| File | What it does |
|---|---|
| `mobile/src/features/updates/` (`config.ts`, `useUpdatePrompt.ts`, `UpdateBanner.tsx`, `UpdateChrome.tsx`, `index.ts`, `README.md`) | **New.** "A new version is ready" with **Restart** and a close button, on the main tabs only. Checks again on returning to the foreground, at most every 30 minutes. Switch `UPDATES_PROMPT_ENABLED`; active only where `UPDATES_ACTIVE`. |
| `mobile/src/app/_layout.tsx` | `<UpdateChrome>` around `RecoveryChrome` (`// updates`) |
| `mobile/src/lib/screen-capture.ts` | **New** adapter: `useSensitiveScreen()`, `preventScreenCapture()`, `allowScreenCapture()`, and `coverAppSwitcher()` (added by plan 04) |
| `mobile/src/lib/device-integrity.ts` | **New** adapter: `checkDeviceIntegrity()` |
| `mobile/src/lib/notify.ts` | **New** adapter: `registerForPushNotifications()`, `showLocalNotification()` |
| `mobile/package.json` | `expo-notifications ~58.1.9`, `expo-screen-capture ~58.0.6` (and `@noble/hashes`, pure JavaScript, from plan 04); script `update:tester-live` |
| `mobile/app.json` | The `expo-notifications` plugin (monochrome icon, Fuchsia `#FF4FB2`, channel `default`); `READ_MEDIA_IMAGES` added to `blockedPermissions`; `android.allowBackup: false` |
| `mobile/eas.json` | **New** profile `tester-live` (plan 05's phone side): channel `tester-live`, internal APK, EAS environment `preview`, `EXPO_PUBLIC_API_URL` placeholder `https://YOUR-DOMAIN` |
| `mobile/src/lib/build.ts` | `TESTER_LIVE` (the channel is `tester-live`); `tester-live` kept out of `PRACTICE_CHANNELS` |
| `mobile/src/features/kyc/config.ts`, `recovery/config.ts` | `KYC_ENABLED` and `RECOVERY_ENABLED` are also off in `tester-live` |
| `mobile/scripts/update.mjs` | Channel `tester-live`, which carries its build profile's `EXPO_PUBLIC_*` values (`profileEnv()`) and refuses to run while `EXPO_PUBLIC_API_URL` is missing or the placeholder |
| `mobile/src/features/account/settings/AboutScreen.tsx` | Privacy and terms summaries; a build with a server address links to `/privacy` and `/terms` |

### Decisions and deviations

- **Root check:** `Device.isRootedExperimentalAsync()` from `expo-device`, which was already installed. It looks for `su` on Android and known jailbreak files on iOS. It's a hint, not proof, and emulators usually report rooted.
- **Adapters load their package lazily and never throw.** A development build made before a package was added, Expo Go and the web just get "nothing happens" (`null`, `false` or a no-op).
- **The adapters are in use now,** not "switched off" as the plan said: plan 04 uses the screen-capture and root-check adapters, plan 06 uses `notify.ts`.
- **`READ_MEDIA_IMAGES` blocked.** Only screenshot *detection* needs it, the app doesn't detect screenshots, and Google Play restricts the permission.
- **`android.allowBackup: false`** (baseline finding N3). Not in the original plan, but it needs the native rebuild, so it goes in this one. AsyncStorage and app files stay out of Google backups and phone-to-phone transfers.
- **`tester-live` in this build window.** The profile and `TESTER_LIVE` belong to plan 05, but they were added now so the online tester APK needs no extra native change later.
- **New Android permissions** from the plugins: `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` and `DETECT_SCREEN_CAPTURE`.

### How it was checked

- `npm run typecheck` and `npm run lint` in `mobile/` pass (re-run for these docs).
- `npm run doctor` after the package changes.
- `npx expo export --platform android` and `--platform web` bundle (Android re-run for these docs: one 7.3 MB Hermes bundle).
- The browser preview on Practice data. The banner can't show there by design (`UPDATES_ACTIVE` is false on the web and in development), so it needs the APK.

### Still needs a real phone

- The banner: install the APK, publish an update, background and reopen the app, see the banner on the main tabs only, tap **Restart**.
- The permissions dialog for notifications on Android 13 and later, and that no `READ_MEDIA_IMAGES` prompt ever appears.
- MobSF on the new APK, to confirm `allowBackup="false"` in the manifest ([masvs-checklist.md](../security/masvs-checklist.md)).

### Left for the owner

1. **Before the build:** add `google-services.json` (steps below). Adding it later changes the native fingerprint, so testers would have to reinstall again.
2. `npx eas-cli@latest login`, then `npm run build:apk` from `mobile/`, then share the link.
3. **For `tester-live`** (once the server is online, plan 05): put the real `https://` address in `build.tester-live.env.EXPO_PUBLIC_API_URL` in `eas.json`, and the four `EXPO_PUBLIC_FIREBASE_*` values in the EAS `preview` environment (EAS doesn't upload `mobile/.env.local`). Then `npx eas-cli@latest build --profile tester-live --platform android`. Later updates go out with `npm run update:tester-live -- "What changed"`.
4. Upload the FCM service-account key to Expo (no rebuild needed) so Android push works.

### Acceptance criteria, phone side

| Criterion | Phone |
|---|---|
| Testers install one APK, and every later change reaches them without reinstalling | Ready once `google-services.json` is added: every native package plans 03 to 07 use is in this build. Waiting for the build. |
| The banner appears when an update has downloaded, and Restart applies it | Built; needs the APK to see it |
| The three native packages are in the build but change nothing yet | Changed: plans 04 and 06 now use them, by over-the-air update once this APK is out |

## Before you build: push notifications

Android push needs `google-services.json` compiled into the APK. Adding it later changes the fingerprint, so testers would have to reinstall again. Before `npm run build:apk`:

1. In the Firebase console, add an Android app with package name `app.vaultwise.mobile`.
2. Download `google-services.json` into `mobile/`.
3. Add `"googleServicesFile": "./google-services.json"` under `expo.android` in `mobile/app.json`.

The FCM service-account key can be uploaded to Expo later without a rebuild. Without the file, local notifications still work and `registerForPushNotifications()` returns `null`.

## Who does what

- **You:** `npx eas-cli@latest login`, then `npm run build:apk` from `mobile/`, then share the link.
- **Claude:** the update module, the adapters and the checks.
