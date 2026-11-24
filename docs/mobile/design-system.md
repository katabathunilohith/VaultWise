# Phone design system

> The UI kit, theme tokens, fonts, icons and haptics the Vaultwise phone app is built from.

This page lists what exists in code at commit `012a9fc` and when to use it. The reasons behind the choices (colour survey, thumb-reach rules R1 to R13, haptics research, store policy) are in [mobile/DESIGN.md](../../mobile/DESIGN.md) and [mobile/RESEARCH.md](../../mobile/RESEARCH.md). Read those before changing a rule.

## Where it lives

| Folder or file | What it holds |
|---|---|
| [mobile/src/theme/tokens.ts](../../mobile/src/theme/tokens.ts) | Palettes, category colours, spacing, radius, layout, fonts, type scale, motion |
| [mobile/src/theme/index.tsx](../../mobile/src/theme/index.tsx) | `ThemeProvider`, `useTheme()`, appearance choice; re-exports the tokens |
| [mobile/src/theme/fonts.ts](../../mobile/src/theme/fonts.ts) | `fontMap` loaded by the root layout |
| [mobile/src/components/ui/](../../mobile/src/components/ui) | The UI kit, exported from `index.ts` |
| [mobile/src/components/icons.ts](../../mobile/src/components/icons.ts) | Shared Phosphor icons, loaded one file each |
| [mobile/src/lib/haptics/](../../mobile/src/lib/haptics) | Haptic tokens, engine and the Pulsar adapter |
| [mobile/src/features/account/layout.tsx](../../mobile/src/features/account/layout.tsx), [controls.tsx](../../mobile/src/features/account/controls.tsx) | Flow and settings frames that several features also use (see below) |
| [mobile/src/components/nav/](../../mobile/src/components/nav) | Tab bar definitions (covered in [app-structure.md](app-structure.md)) |

## Theme

`ThemeProvider` wraps the app in the root layout. `useTheme()` returns:

| Field | What it is |
|---|---|
| `scheme` | `"light"` or `"dark"`. "System" follows the phone; an unknown system value counts as dark. |
| `c` | The palette for this scheme (table below). |
| `pref`, `setPref()` | `"system"`, `"light"` or `"dark"`. Only used on Android and web (`appearanceSettingAvailable`); iOS always follows the system. On Android it also calls `Appearance.setColorScheme`. |
| `cvdGains`, `setCvdGains()` | Colour-blind friendly gains and losses. |
| `gain`, `loss` | `success` / `danger`, or blue / orange when `cvdGains` is on. |
| `cat(key)` | `{ fill, tint }` for a vault category; unknown keys use `custom`. |

The choice is saved as `{ pref, cvd }` under `vw.theme` and survives Delete account.

### Palette

Use palette keys, not hex values. `Txt` accepts a key name as `color` (for example `color="textMuted"`).

| Key | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#0D0A0E` | `#F8F5F7` | Screen background |
| `surface` | `#18141A` | `#FFFFFF` | Cards, rows, inputs |
| `surfaceRaised` | `#221D25` | `#FFFFFF` | Header buttons, tonal buttons, skeletons |
| `border` / `borderStrong` | `#302A33` / `#756D7A` | `#E9E3E7` / `#8A828E` | Hairlines / radio and checkbox outlines |
| `text` / `textMuted` | `#F7F2F5` / `#ADA5AE` | `#151217` / `#5E5761` | Body and secondary text |
| `accent` | `#FF4FB2` | `#8E567C` | Accent text, icons, focus, selected radio |
| `primary` / `primaryPressed` / `onPrimary` | `#FF4FB2` / `#E63F9E` / `#0D0A0E` | `#151217` / `#2E2832` / `#FFFFFF` | Filled primary button |
| `accentFill` / `onAccentFill` | `#FF4FB2` / `#0D0A0E` | `#FF4FB2` / `#0D0A0E` | Decorative fuchsia fill with ink text (chips, switches, checkboxes) |
| `accentSoft` | `#3A1A2D` | `#FCE7F2` | Avatar and icon tiles |
| `success` / `successSoft` | `#52E9B2` / `#1A2E27` | `#047A5C` / `#E8F4EF` | Success status |
| `warning` / `warningFill` / `onWarning` / `warningSoft` | `#FFCD54` / `#FFCD54` / `#0D0A0E` / `#332A16` | `#895706` / `#F5AF20` / `#1A1300` / `#FEF6E4` | Warning status |
| `danger` / `dangerSoft` | `#FF5A47` / `#3A1C1A` | `#C9241B` / `#FBECEA` | Errors and destructive actions |
| `info` / `infoSoft` | `#8DB9FF` / `#1C2433` | `#2F6FD0` / `#EAF1FC` | Information status |
| `ink` | `#0D0A0E` | `#151217` | Text on any vivid fill |
| `paper` | `#FBF8F3` | `#FFFFFF` | Documents and receipts in both themes |
| `scrim` | `rgba(0,0,0,0.6)` | `rgba(21,18,23,0.45)` | Overlays |
| `practice` / `onPractice` | `#2A2530` / `#E9E2EC` | `#EEE8EE` / `#3D3540` | `PracticeBadge` |

Other colour tokens in `tokens.ts`:

- `categoryColors`: `fill` (vivid, same in both themes, always with ink text) and `tint` (per scheme, for icons and progress) for health, education, housing, emergency, retirement and custom.
- `celebrate`: the three-stop milestone gradient. Saving celebrations only.
- `gainLossCvd`: blue up and orange down for each scheme.

### Spacing, radius, layout, motion

| Token | Values |
|---|---|
| `space` | `xxs 4`, `xs 8`, `sm 12`, `md 16`, `lg 20`, `xl 24`, `xxl 32`, `xxxl 48` |
| `radius` | `sm 10`, `md 16`, `lg 24`, `xl 32`, `pill 999` |
| `layout` | `gutter 16`, `gutterWide 20`, `ctaHeight 56`, `ctaBottomGap 16`, `secondaryHeight 48`, `rowMin 56`, `keyHeight 64`, `keyGap 8`, `hit 44`, `tabRootBottomPad 96`, `maxContentWidth 560` |
| `motion` | `instant 100`, `quick 200`, `base 300`, `exit 200`, `screen 450`, `celebrateMax 1000`, `ctaArmDelay 400` (ms); `spring` and `springCelebrate` configs |

### Type scale

Use `<Txt v="token">`. `maxScale` caps Dynamic Type growth; tokens without it scale freely.

| Token | Font | Size / line | Max scale |
|---|---|---|---|
| `displayXL` | Bricolage 800 | 56 / 58 | 1.3 |
| `displayL` | Bricolage 800 | 44 / 47 | 1.3 |
| `displayM` | Bricolage 700 | 34 / 38 | 1.5 |
| `headline` | Bricolage 700 | 28 / 32 | 1.6 |
| `titleL` | Bricolage 700 | 22 / 28 | none |
| `titleM` | Figtree 600 | 18 / 24 | none |
| `bodyL` / `bodyM` | Figtree 400 | 17 / 24, 15 / 22 | none |
| `labelL` / `labelM` | Figtree 600 | 17 / 22, 15 / 20 | none |
| `caption` | Figtree 500 | 13 / 18 | none |
| `micro` | Figtree 600 | 11 / 14 | none |
| `numXL` | Geist Mono 600 | 40 / 44 | 1.3 |
| `numL` / `numM` | Geist Mono 500 | 20 / 24, 15 / 20 | none |
| `numS` | Geist Mono 400 | 12 / 16 | none |

## Fonts

- Three families from `@expo-google-fonts`: Bricolage Grotesque (700, 800) for display, Figtree (400 to 700) for body and UI, Geist Mono (400 to 600) for numbers that change in place.
- `fontMap` in `fonts.ts` imports each weight from its own path. The root layout calls `useFonts(fontMap)` and renders nothing until the fonts load or fail.
- `fonts` in `tokens.ts` holds the registered family names (`fonts.body`, `fonts.monoMedium` and so on). Use those names, not string literals.
- The `fonts.ts` header says store builds should embed the fonts with the `expo-font` config plugin. At this commit `app.json` does not list that plugin.

## Icons

- All icons are [Phosphor](https://phosphoricons.com) (MIT) from `phosphor-react-native`.
- Each icon is loaded from its own file with `require("phosphor-react-native/src/icons/<Name>")`, because the package barrel adds about 6 MB. `require` (not `import`) keeps TypeScript on the published types.
- Shared icons (99 at this commit) are in [components/icons.ts](../../mobile/src/components/icons.ts). Import them from `@/components/icons`. The `Icon` type comes from there too.
- Icons only one area needs sit in that area's `icons.ts`: `features/account`, `home`, `kyc`, `pay`, `proof` and `wallet`. A few files require icons inline instead (`ai-consent/AiConsentSheet.tsx`, `emergency/copy.ts`, `invest/practice/PaperPositions.tsx`, `invest/practice/PracticeView.tsx`).
- Weights in use: `regular` by default, `fill` for selected states and status icons, `bold` for small control glyphs, `duotone` for vault categories (`VaultGlyph`).
- To add an icon: add one `require` line to `components/icons.ts` (or the area's `icons.ts`), typed as `Icon`.
- The native tab bar uses SF Symbols and Material names from `components/nav/tabs.ts`, not Phosphor.

## UI kit

Everything below is exported from `@/components/ui` unless noted.

### Text and touch

| Component | Use it for | Notes |
|---|---|---|
| `Txt` | All text | `v` picks the type token, `color` takes a palette key or a colour, `align`. Applies `maxScale`. |
| `Press` | Any custom tappable | Press-in scale (0.97 default; 0.98 cards, 0.99 rows), optional `hapticOnPressIn` token, defaults to `accessibilityRole="button"`. Skips the scale under Reduce Motion. |

### Buttons and confirmation

| Component | Use it for | Notes |
|---|---|---|
| `Button` | Actions | Variants `primary`, `accent`, `tonal`, `ghost`, `danger`, `dangerOutline`; sizes `lg` (56), `md` (48), `sm` (44 min). `loading` shows a spinner. `armOnMount` ignores taps for 400 ms. Primary and accent play `tap.primary` at touch-down. One primary per screen. |
| `HoldToConfirm` | Irreversible money moves (pay, Tier 2 release, delete without PIN) | 800 ms hold with a fill and the `createHold()` haptic ramp. Release early to cancel. Screen readers get a double-tap "activate" action. `commitHaptic={false}` when a PIN step still follows. Cancels if it turns disabled or unmounts mid-hold. |

### Rows and controls

| Component | Use it for | Notes |
|---|---|---|
| `ListRow` | Settings and navigation rows | At least 56 pt, whole row tappable, leading icon, trailing value or chevron. `destructive` uses the danger colour. Joins title and subtitle into one screen-reader label. |
| `ToggleRow` | On/off settings | Whole row toggles and plays `toggle.on` / `toggle.off`. One `switch` element for screen readers. |
| `Chip` | Choose one of several (reasons, topics, filters) | Radio semantics, `select.tick`, `tall` for 56 pt grids. |
| `Segmented` | Switching views at the top of a screen | Tab semantics, `select.tick` on change. |
| `InfoButton` | A small "i" that opens detail | 32 pt visual, 44 pt target. Give it a label naming what opens. |
| `TextField` | Simple labelled input with a hint | No error state. The account area has its own field with errors (see below). |

### Layout

| Component | Use it for | Notes |
|---|---|---|
| `Screen` | Tab roots and pushed screens | Scrolls, 96 pt extra bottom padding, optional pull-to-refresh with `pull.threshold`. |
| `ModalScreen` | Full-screen modal flows (withdraw, emergency, pay, camera) | Close or Back top-leading, optional title and `headerRight`, `footer` in the R1 slot, `hideLeading` while money commits, `tone="paper"`. |
| `BottomSlot` | The main-button slot | 16 pt above the home indicator, with a fade. `ModalScreen` uses it. |
| `Card` | Grouped content | Optional `onPress` (scale 0.98) and `raised`. |
| `SectionHeader` | A titled section with an optional text action | 44 pt action target. |
| `Row`, `Stack` | Horizontal and vertical gaps | `gap` defaults to `space.sm`. |
| `Divider` | Hairline between rows | |

### Money and keypads

| Component | Use it for | Notes |
|---|---|---|
| `Amount` | Hero amounts | Display font, symbol and decimals at 55%, counts up over 600 ms (instant under Reduce Motion). Sizes `xl`, `l`, `m`. Screen readers hear the full amount. Shrinks to fit. |
| `MoneyText` | Amounts in rows, receipts and breakdowns | Geist Mono so digits do not jitter. `signed`, `whole`. |
| `AmountKeypad` | Typing an amount | 3x4 grid, 64 pt keys, `pin.digit` on every key, `maxDecimals`. |
| `PinPad` | PIN entry | Dots plus a fixed keypad; never shuffled. Submits 120 ms after the last digit. Change `error` to shake and clear. Optional biometric key. Ignores keys after submit until the parent answers. Announces digit counts, never digits. |

### Status, states and progress

| Component | Use it for | Notes |
|---|---|---|
| `StatusPill` | A short status | Always an icon and a word. Tones `success`, `warning`, `danger`, `info`, `neutral`, `accent`. |
| `Banner` | Warnings, errors, notes | Icon and title in the tone colour, optional action link. |
| `PracticeBadge` | Every money screen | "PRACTICE · NO REAL MONEY", or "PRACTICE" with `compact`. |
| `VaultGlyph` | Vault category marks | `icon` (tinted tile), `filled`, or `object` (3D image). |
| `toneColors()` | Custom status visuals | Returns `{ fg, bg }` for a tone. |
| `Skeleton`, `ScreenSkeleton` | Loading | Pulse stops under Reduce Motion. |
| `ErrorState` | A failed load | `variant="calm"` (plain icon) on calm-core screens, `illustrated` elsewhere. Shows a "wait" state for a recovery hold. |
| `EmptyState` | Nothing to show yet | Optional image and action. |
| `ProgressBar` | Linear progress | 25/50/75% ticks by default; animates. |
| `ProgressRing` | Ring progress (vault hero, milestones) | Animates. |
| `Timeline` | Where a money move or case is | Step states `done`, `active`, `pending`, `warn`, `failed`, `skipped`; one screen-reader label per step. |
| `Celebration` | Saving moments only | Full-screen overlay with the `celebrate` gradient, plays `goal.milestone` / `goal.reached` (or the `haptic` you pass), tap to skip, ends after 2.6 s. |
| `ProfileAvatar` | The top-leading avatar on tab roots | Initials or a user icon; opens `/settings`. Reads `/me` itself. |

### Hooks

| Hook | Use it for |
|---|---|
| `useArmed(delay)` | False for the first 400 ms after mount (used by `armOnMount`). |
| `useHardwareBack(handler)` | Android Back inside a multi-step screen: a function steps back, `"block"` swallows it, `null` lets navigation handle it. |
| `useNow(ms, active)` | Re-render on a timer for countdowns and reply times. |
| `useReduceMotion()` | The OS Reduce Motion setting. |

`a11y.ts` has `spoken()`, which joins parts into one screen-reader label. It is used inside the kit and not exported from `index.ts`.

### Account-area frames used elsewhere

These live in `features/account` but the auth, KYC, recovery and wallet features import them too.

| Export | File | Use it for |
|---|---|---|
| `StepScreen()` | `layout.tsx` | One step of a flow: Back or Close, optional "Step n of m", footer in the R1 slot, `scroll={false}` to put a keypad above the button, `keyboard` for text input. |
| `Page()` | `layout.tsx` | A pushed settings page with Back, title, optional pull-to-refresh and footer. |
| `Header()`, `HeaderButton()`, `goBack()` | `layout.tsx` | Header row, 44 pt round Back/Close, back-or-home navigation. |
| `Group()` | `controls.tsx` | Titled group of rows on one surface with hairlines and an optional note. |
| `RadioRow()`, `CheckRow()` | `controls.tsx` | Choose-one row and checkbox row, 56 pt, with proper roles. |
| `FieldError()`, `CalmError()`, `IconButton()` | `controls.tsx` | Inline error, calm error state, 44 pt round icon button. |
| `TextField` | `onboarding/TextField.tsx` | Labelled field with hint, error and focus border; forwards a ref. |

## Haptics

All haptics go through [lib/haptics](../../mobile/src/lib/haptics). Nothing else imports `expo-haptics`. Kit components already play theirs (`Button`, `Press`, `PinPad`, `AmountKeypad`, `Chip`, `Segmented`, `ToggleRow`, `Celebration`, `HoldToConfirm`, pull-to-refresh). What each token means, and when not to play one, is in [DESIGN.md section 4](../../mobile/DESIGN.md#4-haptics-srclibhaptics).

### API

| Export | What it does |
|---|---|
| `haptic(name)` | Plays a token. Returns `false` when skipped. Never throws. |
| `previewHaptic(name)` | Plays a token ignoring rate limits, at Full if haptics are off. Settings preview only. |
| `createHold()` | The 800 ms press-and-hold ramp: `start()`, `cancel()`, `commit()` (plays `irreversible.commit`), `stop()`. |
| `setHapticLevel()`, `getHapticLevel()`, `useHapticLevel()` | The Off / Subtle / Full level, saved under `vw.haptics` (default Full). |
| `initHaptics()` | Reads the saved level and Reduce Motion at start-up. |
| `backend()` | `"pulsar"`, `"expo"`, `"web"` or `"none"`. |
| `TOKENS`, `TokenName` | The token table and its names. |

### How a token plays

- **Level and tier.** Each token has a tier: `E` plays at Subtle and Full; `S` plays only its first beat at Subtle; `X` plays at Full only. Off plays nothing.
- **Session cap.** More than 40 non-touch haptics in 10 minutes drops Full to Subtle until the window has room again. Choosing a level resets the count.
- **Spacing.** At least 50 ms between onsets, plus each token's own minimum interval. Only one `expressive` pattern at a time.
- **Channels.** `tick` < `expressive` < `outcome` < `commit`. A higher channel cancels a lower one that is still playing and skips the 50 ms gap.
- **Silent tokens do not count.** If nothing can play on this device, the call is skipped without using the gap, interval or cap.
- **Reduce Motion.** The basic path plays only the first step; Pulsar patterns drop their continuous part.
- **Backends.** Pulsar (`react-native-pulsar`) plays the `rich` pattern when its native module is present with support level 2 or more. Otherwise `expo-haptics` plays `steps`: iOS impact, notification or selection; Android system constants chosen by API level, with an iOS-style fallback. The web uses `navigator.vibrate`, only after the person has interacted with the page.
- **Pulsar loading.** `pulsar.native.ts` looks up the `RNPulsar` TurboModule directly and never imports the package, because its entry throws in Expo Go. `pulsar.ts` is the web stub and returns `null`. The level also switches Pulsar on or off.

### Tokens

| Token | Tier | Channel | Min interval (ms) | Pulsar pattern |
|---|---|---|---|---|
| `tap.primary` | X | tick | 100 | no |
| `select.tick` | S | tick | 50 | no |
| `tab.change` | X | tick | 80 | no |
| `toggle.on`, `toggle.off` | E | tick | 150 | no |
| `slider.detent` | S | tick | 50 | no |
| `slider.edge` | S | tick | 300 | yes |
| `drag.pickup`, `drag.drop`, `longpress.menu` | S | tick | 300 | no |
| `pull.threshold`, `swipe.commit` | S | tick | 300 | no |
| `pin.digit` | E | tick | 0 | no |
| `pin.wrong` | E | outcome | 800 | no |
| `unlock.success` | E | outcome | 30,000 | yes |
| `deposit.coinDrop` | S | expressive | 2,000 | yes |
| `goal.milestone`, `goal.reached` | S | expressive | 2,000 | yes |
| `vault.locked` | E | outcome | 2,000 | no |
| `proof.verifying` | X | expressive | 1,000 | only (silent without Pulsar) |
| `proof.approved`, `proof.declined` | E | outcome | 1,000 | no |
| `proof.review` | E | outcome | 1,000 | yes |
| `emergency.tick` | X | tick | 900 | yes |
| `emergency.finalTick` | E | tick | 900 | yes |
| `irreversible.commit` | E | commit | 2,000 | yes |
| `pay.success` | E | outcome | 1,000 | no |
| `warning` | E | outcome | 5,000 | yes |
| `error` | E | outcome | 2,000 | no |

All the `tick` tokens except `emergency.tick` and `emergency.finalTick` are touch tokens: they do not count toward the session cap.

### Adding a token

1. Add it to `TOKENS` in `tokens.ts` with a tier, channel, interval, `steps`, and optionally `rich`.
2. Add a plain-words entry to `HAPTIC_CATALOG` in `features/account/settings/hapticCatalog.ts`. It is typed against `TokenName`, so the build fails without it.
3. Add its meaning to the table in DESIGN.md section 4.

## Maintainability notes

- `features/account/layout.tsx` and `controls.tsx` are a second kit. They overlap with `Screen`, `ModalScreen` and `BottomSlot` (pull-to-refresh with its haptic, the faded footer, the round header button), and other features import them from inside the account feature.
- Two `TextField` components exist: `components/ui/TextField.tsx` and `features/account/onboarding/TextField.tsx`. Auth, KYC and Data source use the account one.
- `ErrorState` (`states.tsx`) imports from `lib/api/errors`, and `ProfileAvatar` calls `useMe()`. The kit depends on the data layer.
- `keypads.tsx` sets `fontFamily: "Figtree_600SemiBold"` as a string instead of `fonts.bodySemi`.
- `progress.tsx` writes shared values with `.value =`; the rest of the kit uses `.get()` and `.set()`.
- `money.tsx` ends with `export { fonts }`, a re-export nothing in the kit needs.
- Some files require Phosphor icons inline rather than through an `icons.ts`, so the "one place per area" rule is not followed everywhere.
- A few kit files use hex values directly (`Button.tsx` uses `#FFFFFF` for danger text in light mode; `ToggleRow` uses `#FFFFFF` for the switch thumb).
- The kit, the theme and the haptics engine have no tests. `mobile/` has no test runner.
