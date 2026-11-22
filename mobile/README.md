# Vaultwise mobile

The Vaultwise app for iPhone and Android: Expo SDK 58, React Native 0.88, expo-router.
It talks to the Next.js API in the repo root and falls back to built-in demo data when it can't reach it,
so it always runs.

- **Why it looks and behaves the way it does:** [`RESEARCH.md`](RESEARCH.md) (colour, thumb reach,
  haptics science, 2,500+ competitor reviews, store policy) and [`DESIGN.md`](DESIGN.md) (the rules
  screens are built from).
- **Practice build.** Balances, payouts and merchant checkouts are simulated. Every money screen says
  so. App stores only accept real-money finance apps from the licensed provider.

## Run it

All commands run inside `mobile/`.

```bash
npm install
```

### In a browser (fastest look, no phone needed)

```bash
npm run web
```

Opens on http://localhost:8081. Haptics, camera and Face ID need a phone.

### On your phone with Expo Go (quick, most features)

```bash
npm run start:go
```

Scan the QR code with the Camera app (iPhone) or Expo Go (Android). Expo Go plays the system haptics;
the custom haptic patterns (coin drop, milestone swell, hold-to-pay ramp) and Face ID need a
development build. On iPhone you have to sign in to the same Expo account in Expo Go and the CLI
(`npx expo login`).

### Development build (everything, including custom haptics and Face ID)

```bash
npx eas-cli@latest build --profile development --platform android
```

For iPhone use `--platform ios` (needs an Apple Developer account). Install the build, then run
`npm start` and open the project from the development build.

### Shareable APK (Android, Practice data, no computer needed)

```bash
npx eas-cli@latest build --platform android --profile apk
```

Builds in Expo's cloud (free Expo account; `npx eas-cli@latest login` first) and gives a link to the
`.apk`. Anyone can install it on Android after allowing "Install unknown apps". It runs on Practice
data, so it needs no server; custom haptics and fingerprint unlock work, unlike in Expo Go.

## Connect to the API

Start the web app and API from the repo root so phones on your Wi-Fi can reach it:

```bash
npx next dev -H 0.0.0.0
```

The app uses the computer that's serving the app on port 3000 automatically. To point it somewhere
else, set `EXPO_PUBLIC_API_URL` (for example `http://192.168.1.20:3000`) before starting Expo, or change
it in the app: **Profile → Data source**. If the API can't be reached the app switches to demo data and
says so. The demo PIN is `1234`.

## Releases and updates

Versions follow `MAJOR.MINOR.PATCH` in `app.json` and are logged in [`CHANGELOG.md`](CHANGELOG.md). Build
numbers count up by themselves.

- **Code or design change:** commit it, then push it to installed APKs over the air.
  `npm run update:apk -- "What changed"`. Phones pick it up the next time the app is opened and closed.
- **Native change** (a new package with native code, permissions, icon, splash, `app.json` plugins): build a
  new APK with `npm run build:apk` and share the new link. The fingerprint runtime version stops an update
  from reaching a build that can't run it.
- **Release:** move the **Unreleased** notes in `CHANGELOG.md` under the new version, set the same version
  in `app.json`, commit, and tag it (`git tag v0.2.0`).

APK and store builds are Practice only. They check their update channel when the app runs, so an update
can't turn that off. The version, channel and running update show in **Profile → About Vaultwise**.

## Public test site

A Practice-only link for real people to try, with opt-in activity sharing and a feedback form. Setup and
removal steps are in [`src/features/tester/README.md`](src/features/tester/README.md).

## Checks

```bash
npm run typecheck
```

```bash
npm run lint
```

## Where things are

| Path | What |
|---|---|
| `src/app/` | Screens (file-based routes). `(tabs)/` holds Home, Vaults, Pay, Invest, Emergency. |
| `src/features/` | Components for each area of the app. |
| `src/components/ui/` | The shared UI kit: buttons, keypads, PIN pad, timeline, hold-to-pay, layout. |
| `src/theme/` | Colours, type scale, spacing, motion. |
| `src/lib/haptics/` | The 29 named haptics and the engine that plays them. |
| `src/lib/api/` | API client, demo simulator, React Query hooks. |
| `assets/emoji3d/` | Fluent 3D emoji (MIT, Microsoft) used for vault objects and celebrations. |
