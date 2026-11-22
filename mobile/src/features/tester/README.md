# Tester mode

A public Practice link for real people to try. It adds a card on Home with three tasks, an opt-in for sharing activity, and a feedback form with a System Usability Scale (SUS) score. It only exists in the tester build, which is always Practice: pretend money, no server, no sign-in, no ID checks and no AI calls.

## What gets recorded

Only after someone taps "Yes, share":

- A random ID, the platform, the route pattern of each screen, and the name of each step they finish (for example `vault_created`). The full list is `ACTIONS` in `model.ts`.
- Never a name, an amount or anything typed.

The feedback form is sent only when someone presses Send. It holds their 10 SUS answers, the score, whether they'd lock their own money, and an optional comment.

## Set it up

1. Create a free project at [posthog.com](https://posthog.com).
2. In PostHog, go to Settings, Project, General, and choose to discard client IP data under IP data capture.
3. Put the project API key in `mobile/.env.local` as `EXPO_PUBLIC_POSTHOG_KEY`. If you chose EU hosting, also set `EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com`.
4. Log in to Expo, then publish from `mobile/`:

```bash
npx eas-cli@latest login
```

```bash
npm run deploy:tester
```

The first deploy asks you to link a project and pick a subdomain. Open the link and reload a sub-page such as `/settings` to check it loads.

## Read the results in PostHog

- **Funnel:** `test_started`, `vault_created`, `bill_sent`, `emergency_requested`, `feedback_sent`.
- **Usability:** the average of `sus_score` on `feedback_sent`. 68 is the usual average for SUS.
- **Demand:** `feedback_sent` broken down by `would_lock`.

## Known limits

- Practice data lives in memory, so reloading the page puts the sample account back. Ticked tasks are kept.
- These are testers using pretend money. Report them as testers, not customers.

## Remove it

Delete this folder, `src/app/tester-feedback.tsx`, `src/lib/api/observe.ts` and `scripts/build-tester.mjs`, then remove each line marked `tester`:

| Where | What to remove |
|---|---|
| `src/app/_layout.tsx` | the `TesterHost` lines and the `tester-feedback` screen |
| `src/features/home/HomeScreen.tsx` | `TesterCard` |
| `src/lib/api/client.ts` | `observed` |
| `package.json` | `build:tester` and `deploy:tester` |
