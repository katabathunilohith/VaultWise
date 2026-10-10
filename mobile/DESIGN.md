# Vaultwise mobile — design brief

The research behind every rule here (Gen Z colour survey, thumb-reach studies, haptics science,
2,500+ app-store reviews of 30 competitors, store policy) is summarised in `RESEARCH.md`.
This file is what the app is built from. If code and this file disagree, fix one of them.

## 1. Principles

1. **Expressive shell, calm core.** Home, Vaults, milestones and sharing get colour, big type, 3D
   objects and rich haptics. Moving money, PINs, verification, Emergency, Limits, Invest and Settings
   stay plain, quick and fully explained: neutral surfaces, full sentences, no emoji, no confetti,
   system haptics only.
2. **A lock is a promise, not a trap.** Vaultwise holds money on purpose, which is exactly what users
   of every competitor hate when it happens by accident ("money stuck, no reason, no ETA"). So every
   hold shows: what it's waiting for, why, when, and what you can do. A person is always reachable.
3. **No surprise money movement.** Anything automatic is visible beforehand and pausable in one tap.
4. **Practice build.** Neither store accepts a real-money finance app from a student team
   (Apple 5.1.1(ix), 3.2.1(viii); Play financial-services policy). Every money screen carries the
   `PracticeBadge` ("Practice · no real money"). Never claim returns or yield.
5. **Celebrate saving, never spending or trading.** No confetti, points, streak haptics or
   celebration on money going out, practice trades, or price moves (Robinhood/Massachusetts, FCA).

## 2. Visual system (`src/theme`)

- **Colour.** Near-black base, one saturated signature accent (**Fuchsia** `#FF4FB2`), greyscale
  everywhere else. Dark designed first; light fully equal. Appearance follows the system
  (iOS: no in-app switch per Apple HIG; Android/web: Light / Dark / System in Settings).
  - Accent ≤10% of a screen: one primary button, the active tab, key highlights.
  - Dark primary button = fuchsia with ink label. Light primary button = ink with white label
    (monochrome + pops); fuchsia appears as decorative fills with ink text (`accentFill`).
  - Status colours only where there's a status, always with icon + word (`StatusPill`, `Banner`).
  - Category colours (`cat(key).fill` / `.tint`) are UI-only: vault card fills with ink text,
    icon tint, progress. Never on amounts or status. Every category always shows icon + label.
  - Documents and receipts sit on light `paper` cards in both themes.
  - Gradients (`celebrate`) only in saving milestones, never behind amounts or text blocks.
- **Type.** Bricolage Grotesque (display ≥22pt), Figtree (body/UI), Geist Mono (numbers that update
  in place: amounts in rows, countdowns, IDs). Use `<Txt v="...">` and `<Amount>` / `<MoneyText>`.
  Sentence case everywhere. Hero amounts: symbol + decimals at 55% size.
- **Icons.** Phosphor via `@/components/icons` (regular weight in UI, `fill` for selected, `duotone`
  for vault categories). 3D Fluent emoji (`emoji3d`, `CATEGORIES[k].object3d`) only in the expressive
  shell: vault objects, empty states, celebrations. Never in calm-core screens.
- **Motion.** 100/200/300/450 ms tokens (`motion`). Press-in scale 0.97. Nothing you must wait for.
  Reduce Motion: movement becomes 150 ms fades, count-ups become instant swaps (built into the kit).

## 3. Navigation and placement (thumb-reach research)

People touch the centre of the screen most accurately (~7 mm) and the corners worst (~12 mm). The
comfortable thumb area doesn't grow with the phone, so on 6.1–6.9" phones it's the lower-middle third.

- **Tabs (native, fixed):** Home · Vaults · **Pay** (centre: the only bottom slot natural for both
  thumbs) · Invest · Emergency. Settings live behind the **avatar** (top-leading on each tab root).
- **R1 main button:** in full-screen modal flows, use `ModalScreen footer={...}` — full width,
  56 pt, 16 pt above the home indicator. Continue → Confirm → Done always use this same slot.
  A step's main button uses `armOnMount` (ignores taps for 400 ms).
- **R2 secondary action:** above the main button (48 pt, tonal/ghost). Never side by side with a
  destructive action.
- **R4 tab roots and pushed screens:** primary actions inline in the lower-middle at scroll-top,
  never pinned above the tab bar.
- **R5 destructive:** never the primary, never in the R1 slot of a flow; lives in a "…" menu or at
  the end of a settings group; always confirmed; money actions also need PIN/biometrics.
- **R6 headers:** max 1 leading (Close/Back/avatar) + 2 trailing items, 44 pt hit areas. Any frequent
  header action has an in-content twin.
- **R7 presentation:** money flows, camera, PIN, checkout, Assistant = `fullScreenModal` (already
  registered in `src/app/_layout.tsx`). Choose-one-of-few and explanations = `track` form sheet or
  inline expandable cards. Vault detail, settings = pushed. Never stack sheets.
- **R8 amount keypad** (`AmountKeypad`): lower middle, directly above the main button.
- **R9 PIN pad** (`PinPad`): bottom edge ≈ 48 pt above the home indicator; auto-submits.
- **R10 rows** ≥56 pt, whole row tappable. **R11 swipes:** none required; offer long-press menus only
  as a shortcut to actions that also exist on the detail screen.
- **R12** no custom horizontal gestures on pushed screens (they fight the iOS back gesture);
  horizontal carousels only on tab roots, with 16 pt insets. Nothing starts at the bottom edge.
- **R13** tab roots: `Screen` adds 96 pt bottom padding so the last item reaches mid-screen.
- **Left-handed:** symmetric placements (full-width buttons, centred keypads/shutter). No handedness setting.
- **Accessibility:** every control labelled; 44/48 pt minimum targets; Dynamic Type (body scales,
  display caps ~1.3×); at large text, stack side-by-side buttons with the primary at the bottom.

## 4. Haptics (`src/lib/haptics`)

All haptics go through `haptic("token")`, `createHold()` or kit components (Button, Press, PinPad,
AmountKeypad, Chip, ToggleRow, Celebration, HoldToConfirm play theirs already). Never import
expo-haptics directly. Fire a haptic on the **same frame** as its visual change. A haptic is never
the only signal (iOS silences haptics in Low Power Mode and **while the camera is active** — play
`proof.approved` after the camera view has closed).

| Token | Use it for (and nothing else) |
|---|---|
| `tap.primary` | (automatic) touch-down on primary buttons |
| `select.tick` | chips, segmented controls, pickers, reason grids |
| `tab.change` | (automatic) switching tabs, Full level only |
| `toggle.on` / `toggle.off` | (automatic in `ToggleRow`) |
| `slider.detent` / `slider.edge` | stepping a slider; hitting min/max/a personal limit |
| `longpress.menu`, `drag.pickup` / `drag.drop` | long-press menus; reordering |
| `pull.threshold` | (automatic in `Screen` pull-to-refresh) |
| `pin.digit` | (automatic in keypads) |
| `pin.wrong` | PIN rejected (pair with the dots shake: `PinPad error={n}`) |
| `unlock.success` | app unlocked |
| `deposit.coinDrop` | money lands in a vault (user-initiated deposit confirmed) |
| `vault.locked` | a new vault is created ("Lock it"): pass `haptic="vault.locked"` to `Celebration` |
| `goal.milestone` / `goal.reached` | vault crosses 25/50/75% / reaches 100% (use `Celebration`) |
| `proof.verifying` | heartbeat every 1.2 s while the verifying screen is visible, **max 6 beats** |
| `proof.approved` / `proof.review` / `proof.declined` | the three verification outcomes |
| `emergency.tick` / `emergency.finalTick` | Tier 2 safety pause: once at start, then each of the last 5 s |
| `irreversible.commit` | the moment an irreversible action commits (also automatic at the end of `HoldToConfirm`) |
| `pay.success` | Pay with Vaultwise confirmed — plain, no flourish |
| `warning` | near a limit, a guardrail engaged, low-quality photo, vault/merchant mismatch |
| `error` | a submit failed (never per keystroke) |

Silent on purpose: scrolling, ordinary navigation taps (apart from the Full-level tab tick), push notifications, practice trades, price
changes, AI chat streaming, background events, streaks.

## 5. Copy

Outcome first, then the number ("Paid. ₹840 is on its way."). One plain reason, never internal
terms (attestation, post-hoc, threshold, confidence, SLA, guardrail → "safety limit"). Always a next
step and a human on every negative outcome ("Ask a person to check"). Exact times beat ranges
("by 3:40 pm"). Describe the document, never the person ("This file looks edited"). Headlines ≤6
words; body ≤2 lines on a 375 pt screen. Calm core: no slang, emoji or exclamation marks. Global
English: "money" not "funds", "your bank" not "linked account", "payday" not "paycheck".

## 6. Data

`api` from `@/lib/api/client` (live server, or demo simulator when it can't be reached), React Query
hooks from `@/lib/api/hooks` (`useDashboard`, `useVault(id)`, `useProof(id)` polls, `useCheckout(id)`
polls…), `useInvalidateMoney()` after anything that moves money. Responses are minor units; request
bodies are major units (the client methods take major units). Format with `@/lib/money`
(`money`, `moneyWhole`, `moneyCompact`, `parseAmount`). Demo PIN is `1234` (`DEMO_PIN`).
Sample documents: `useSamples()` + `sampleSource(key)` from `@/lib/api/samples`.

## 7. Features (what competitors have, and how Vaultwise does it better)

Each item cites the complaint it answers (review counts are 1–2★ reviews from Apple's RSS feed,
collected 10 Oct 2026; see RESEARCH.md).

1. **Release tracker** on every money movement — submitted → reading your bill → checks → (a person)
   → paid, with an exact time and the next action. Answers "money stuck / frozen, no reason, no ETA"
   (Jar 37% of low-star, Plum 21%, Chime/Qapital/Acorns 149 reviews, Monzo/Revolut frozen-account 19%).
2. **Explainable verdicts with a human path** — the failing check in plain words, what to upload
   instead, "Ask a person" in one tap. Answers generic denials (WEX 33%, Cash App "no reason" 28,
   Venmo 25, PayPal 26).
3. **Release contract** on every vault, shown before money goes in: what unlocks it, the emergency
   route, hold times. Turns the lock into a promise.
4. **Upcoming moves** — every scheduled contribution, round-up sweep and SIP buy visible 7 days ahead
   with one-tap skip and a "Pause all auto-saves" switch. Answers surprise debits (197 of 1,048 low-star
   reviews in AI/budget apps; Oportun 19%, Acorns, Qapital overdrafts).
5. **A person within two taps** — `support` screen: a case with queue position and expected reply
   time; the assistant hands over with context. Answers bot-only support (Venmo 31%, Revolut 41%,
   Monzo 28%, Jupiter 40%).
6. **Guaranteed emergency floor** — Tier 1 is never blocked by a proof under review; the Emergency tab
   says so. Answers "one flag froze everything" (Monzo, Revolut).
7. **Pay with Vaultwise with certainty** — verified merchant, matched invoice lines, which vault pays,
   remaining balance, receipt auto-attached; press-and-hold to pay; refunds go back to the vault.
   Answers marketplace scams/misdirected payments (Cash App, Venmo, PayPal) and FSA card declines (WEX).
8. **Proof checklist before capture** — what this vault's proof needs, ticked as the photo is reviewed;
   warnings before submitting. Answers after-the-fact denials (WEX, EZ Receipts).
9. **Saved payees per vault** — one-tap reuse of past payees. Answers retyping providers (HealthEquity, WEX).
10. **Personal vaults** — 3D object, cover emoji, pin to Home. Answers "tiny photos, can't reorder"
    (Qapital, SoFi asks for vault icons).
11. **Calm, honest engagement** — weekly streak that forgives (pause, not "broken"), fresh-start prompts
    on payday/new month, contributions framed per day ("₹170 a day · ≈₹5,000 a month"), "X to go"
    once past 75%. No coins, spins, leaderboards (CRED 31% rewards complaints).
12. **AI assistant with a dial** — Straight (default), Hype, Roast (opt-in; never on Health,
    Emergency, declines, limits). Labelled "AI"; consent naming the provider before first use; a
    Report button; never moves money from chat — suggestions open the normal flow with PIN.
13. **Clean exits** — Delete account lists vault balances and where they'll go; export your data.
14. **Trust centre** — who holds the money (simulated in Practice), what happens if Vaultwise
    closes, the fee pledge (core vaults free), the haptics/sounds/notification controls.

## 8. Screen map (`src/app`)

| Route | Presentation | Owner area |
|---|---|---|
| `(tabs)/index` Home | tab root | home |
| `(tabs)/vaults/index`, `(tabs)/vaults/[id]` | tab root, pushed | vaults |
| `(tabs)/pay` | tab root (scanner-first) | pay |
| `(tabs)/invest` | tab root (Core · Practice) | invest |
| `(tabs)/emergency` | tab root | emergency |
| `withdraw/[vaultId]` | full-screen modal flow | proof |
| `proof/[id]`, `track` | pushed / form sheet | proof |
| `add-money/[vaultId]`, `new-vault` | full-screen modal | vaults |
| `emergency-request` | full-screen modal flow | emergency |
| `checkout/[intentId]` | full-screen modal | pay |
| `assistant` | full-screen modal | assistant |
| `support` | pushed | assistant |
| `activity`, `upcoming` | pushed | home |
| `welcome`, `onboarding/*`, `unlock` | gated stack | account |
| `settings/*` | pushed | account |
