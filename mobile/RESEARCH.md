# Vaultwise mobile — research behind the design

Compiled 10 Oct 2026 by a multi-agent research pass (19 agents): five design-science studies, six
app-store review-mining runs across 30 competitor apps, adversarial fact-checks of the science-heavy
findings, and three gap studies a completeness critic asked for. Numbers below are the corrected
versions after fact-checking. "Inference" marks design judgement rather than a sourced fact.

---

## 1. Colour: what "the most successful Gen Z colour scheme" actually is

**Finding.** Across 23 apps with large Gen Z audiences (TikTok, Snapchat, Instagram, BeReal, Discord,
Pinterest, Threads, Spotify, YouTube, Duolingo, Opal, Cash App, Venmo, Revolut, Robinhood, Monzo, Cleo,
Step, Jar, CRED, Fi, Copilot, Klarna) no single hue dominates — the largest family (red/pink/coral)
covers 7 of 23. What repeats is a **structure**:

- a black/white or near-black base;
- **one** bright, saturated signature colour for the brand and primary action (17 of 19 colour-led
  brands have OKLCH chroma ≥ 0.15) — Spotify green, Robinhood "Robin Neon", Snapchat yellow;
- greyscale for everything else; gradients only for special moments (3 of 23);
- dark mode available everywhere it could be checked (17 of 17 confirmed).

This is correlation, not cause.

**Theme default.** Apple: people "expect all apps… to respect their preference"; NN/g 2023 recommends
mirroring the OS setting; reading performance favours light mode for normal vision (NN/g 2020; Gazit et
al. 2025). So: **follow the system, design dark first, keep light equal.** iOS gets no in-app switch
(HIG); Android/web do.

**Signature hue — Fuchsia `#FF4FB2`.** The first pick (violet) failed a 135-brand collision test: violet
/indigo is the most crowded band among payment brands in all 8 markets (PhonePe `#5F259F`, Jar, Klarna,
Zelle, Shop Pay, GXS Bank's lavender at ΔE00 1.8). Only magenta-pink and citron leave room for a vivid
accent ≥ ΔE00 15 from every payment brand. Fuchsia also sits in the most common Gen Z hue family and holds
up best under colour-blindness simulation. Light mode uses ink buttons with fuchsia pops (a vivid
magenta that passes 4.5:1 on white collides with iDEAL in the euro area). All 68 text/UI contrast pairs
pass WCAG 2.2. Risks: pink can read as gendered (counter with neutral base and confident type); check
colour trademarks (Deutsche Telekom magenta) before locking the logo.

**Status colours are never the only cue** (≈1 in 12 men have colour-vision deficiency): icons + words
always, and a colour-blind gains/losses toggle (blue/orange) like Robinhood's.

Sources: brand pages (discord.com/branding, venmo.com/about/brand, Robinhood Chain brand guidelines,
brandkit.opal.so, developer.spotify.com/documentation/design), Lazyweb design-system audit (Jul 2026,
n=520), NN/g "Dark mode" (2020, 2023), Apple HIG Dark Mode, W3C WCAG 2.2 SC 1.4.1/1.4.3/1.4.11,
Machado et al. 2009 CVD model, NEI colour-blindness facts.

## 2. Navigation: the thumb-reach "heat map"

**Finding.** People prefer to touch, and are most accurate at, the **centre** of the screen (~7 mm
error vs ~12 mm at corners — Hoober's aggregate, unpublished method). The comfortable one-thumb area is
~36 cm² and **doesn't grow with the phone** (Le et al., CHI 2018; an envelope reached by ≥25% of 16
participants, so treat it as optimistic) — on 6.1–6.9" phones that's the lower-middle third. The corner
nearest the thumb base is slow and inaccurate (Trudeau et al. 2012). Grips change constantly
(Hoober 2013/2017), so nothing is truly unreachable; design primary actions for the zone that's natural
for **both** thumbs. Targets: 9.2–9.6 mm (Parhi et al. 2006), platform minimums 44 pt / 48 dp.
Visible navigation beats hidden menus (NN/g).

**Applied.**
- Five native tabs: Home · Vaults · **Pay** · Invest · Emergency. Pay takes the centre — the only bottom
  slot natural for both thumbs. It's a tab (a destination: scanner + pending checkouts), not a raised
  button: Apple says tab bars are for navigation, and a raised button needs a non-native tab bar.
  (Hoober suggests ≤4 bottom items on smaller phones; five is the platform maximum — test a 4-tab variant.)
- Settings behind an avatar on every tab root; Emergency stays visible as the safety promise.
- Money flows are full-screen modals with one 56 pt main button 16 pt above the home indicator, in the
  same slot for every step; keypads and the PIN pad in the lower middle; destructive actions never in
  that slot.
- No custom horizontal gestures on pushed screens (iOS 26 lets you swipe back from anywhere).
- To validate on 6.1–6.9" phones: a dev-only reach test (5×10 grid of targets, ≥12 people, both hands).

Sources: Hoober (UXmatters 2013, 2017 Parts 1–3), Le et al. CHI 2018, Trudeau et al. 2012,
Bergstrom-Lehtovirta & Oulasvirta CHI 2014, Parhi, Karlson & Bederson 2006, Bi et al. CHI 2013 (FFitts),
NN/g hidden navigation, Apple HIG (tab bars, sheets), Material 3, Expo SDK 57 native-tabs docs.

## 3. Haptics: what makes them feel satisfying (and how Opal-style polish is built)

**Science.**
- Phone actuators (LRAs) resonate where skin is most sensitive (Pacinian peak ≈250 Hz), so character
  comes from **rhythm and sharpness**, not frequency. Short, crisp transients feel premium; long buzzes
  feel cheap — Android's guidance says prefer no haptic to a buzzy one.
- **Timing:** people perceive touch and tactile feedback as simultaneous within ~5 ms; quality drops
  past 70–100 ms (Kaaresoja, Brewster & Lantz 2014). Fire on touch-down, on the same frame as the visual.
- **Meaning:** ≤3 intensity levels, each ≥1.4× the last; ≥50 ms between onsets (Android custom-effects
  guidance). Tactile key feedback measurably improves touchscreen entry (Hoggan, Brewster & Johnston CHI
  2008) — so the PIN pad and amount keypad tick on every key.
- **Calm waiting:** slow, low-sharpness rhythms read as calm; rapid trains read as alarming
  (Seifi & MacLean 2013, on 1 s alerts — used here only for waiting/countdown rhythms).
- **Fatigue:** overuse dulls perception and gets haptics switched off; give people a setting.
- **Opal:** the only documented facts are that its milestone "gem reveal" pairs a 3D animation with
  "meticulously fine-tuned" haptics and reward sounds (2M+ reveals), and that haptics follow the iOS
  system switch. Its polish is sparse, tightly synced moments — not haptics everywhere.

**Ethics.** Regulators flagged celebratory feedback on trades (Robinhood removed confetti in 2021; FCA
found game-like features raised trading). So: celebrate **saving, proof and security**; payment success
stays the plain system success; no haptics on practice trades, price moves, streaks, chat streaming or
push notifications; every pattern is deterministic.

**Built.** 29 named tokens (`src/lib/haptics/tokens.ts`). iOS uses system feedback generators; Android
uses system haptic constants (`performHapticFeedback`, API-level fallbacks) instead of buzzy vibration.
Custom Core Haptics / Composition patterns (coin drop, milestone swell, verifying heartbeat, hold-to-pay
ramp, irreversible "thud + latch") play through Software Mansion's **Pulsar** in development/store
builds; Expo Go falls back to the system set. Off / Subtle / Full setting, Reduce Motion, rate limits
and a session cap. Recipes are starting values to tune on an iPhone and a Pixel/Galaxy.

Sources: Apple HIG Playing haptics & WWDC19 520/810, Core Haptics docs, Android haptics principles,
HapticFeedbackConstants & VibrationEffect.Composition references, AOSP vibrator source, Expo Haptics
(SDK 57) docs, Pulsar 1.7.0 source, Opal blog & help centre, CNBC/Massachusetts on Robinhood, FCA 2022.

## 4. What Gen Z responds to (and what erodes trust)

- Only 40% of Gen Z are satisfied with their bank's interface design vs 81% of Boomers/Gen X
  (Corporate Insight). 42% live paycheck to paycheck; 41% feel money guilt weekly (BofA 2026).
  58% of 18–34s say financial-brand language doesn't sound like them (Reach3 2026).
- Google's own research: expressive design is preferred by up to 87% of 18–24s — while warning it
  "might not be suitable for something like a banking interface". Hence **expressive shell, calm core**.
- Behavioural evidence used: earmarked, visually labelled pots raise saving (Soman & Cheema 2011);
  commitment devices (Ashraf, Karlan & Yin 2006); goal-gradient (Kivetz et al. 2006); daily framing of
  contributions quadrupled sign-ups (Hershfield et al.); fresh-start effect (Dai, Milkman & Riis 2014);
  streaks help while intact but shaming breaks cause drop-off (Silverman & Barasch 2023).
- Type: Bricolage Grotesque (display), Figtree (UI), Geist Mono (numbers). Icons: Phosphor. 3D: Fluent
  Emoji (MIT), only in the expressive shell.
- Don't: confetti for money out or trading, points/leaderboards, fake urgency, confirmshaming, roast
  humour on hard moments, AI that hides it's AI (EU AI Act Art. 50 from 2 Aug 2026), public-by-default
  feeds (FTC/Venmo), late fees at checkout (drip pricing), ads in money screens.

## 5. Competitor review mining (2,500+ App Store reviews, 30 apps)

Method: Apple's public customer-review RSS (up to 500 most recent per app, storefronts us/gb/in),
1–2★ reviews coded into themes and counted; qualitative web sources only where RSS failed.

| Group | Apps | Biggest complaints (share of 1–2★) |
|---|---|---|
| Savings & round-ups (US) | Qapital, Acorns, Chime, Oportun, SoFi | money stuck / slow withdrawals (149), fees & cancellation traps (195), support (163), surprise auto-transfers (64) |
| Neobank pots (UK) | Revolut, Monzo, Plum, Chip, Moneybox | bot-only support (Revolut 41%, Monzo 28%), frozen accounts with no timeline (~19%), slow/failed withdrawals (18–21%) |
| India | Jar, Jupiter, CRED, PhonePe (+Fi wind-down) | can't withdraw (Jar 37%), less back than saved (Jar 38%), unreachable support (Jupiter 40%), slot-machine rewards (CRED 31%) |
| AI money coaches | Cleo, Copilot, Rocket Money, YNAB, Monarch | surprise charges (197 of 1,048), paywalls before value (199), redesign churn (YNAB 62%), bank-sync failures (144) |
| Payments | Cash App, Venmo, PayPal, Klarna | opaque account closures with no reason, AI support loops (Venmo 31%), redesigns that bury balances (PayPal 28%) |
| Receipt substantiation | HealthEquity, EZ Receipts, WEX, Benepass, Lively, Expensify | login lockouts (HealthEquity 57%), generic denials and inconsistent decisions (WEX 33%), lost uploads |

**The pattern that matters most for Vaultwise:** across every group, people are angriest when they lose
access to their own money with no reason or timeline, and when support is a bot. Vaultwise locks money
on purpose — so it must over-deliver on explanation, timelines and a reachable person. No reviewer in
2,500 mentions haptics: polished, meaningful haptics are unclaimed territory.

Features built from this (see DESIGN.md §7): release tracker, explainable verdicts with appeal,
release contract per vault, upcoming-moves preview with pause, a person within two taps, guaranteed
emergency floor, verified checkout with hold-to-pay, proof checklist before capture, saved payees,
forgiving streaks, AI with a tone dial and a human handoff, clean exits, trust centre.

## 6. Store policy (why everything says "Practice")

- Apple 5.1.1(ix) and 3.2.1(viii): banking, money-management and investing apps must be submitted by
  the licensed entity providing the service — not an individual or a student team. Apple 2.2: demos go
  on TestFlight. Google Play: financial products should use an organisation account (D-U-N-S) and comply
  with local law in every target country.
- So the shippable build is **Vaultwise Practice**: simulated balances, sandbox merchant checkout,
  practice-only Satellite, "Practice · no real money" on every money screen. Distribute via TestFlight
  internal (≤100) and Play internal testing (≤100).
- Also required in any build: 18+ rating and gate, consent naming the AI provider before data is sent,
  an in-app AI report button, account deletion in-app **and** on the web, privacy labels / Data safety,
  privacy manifest, system photo picker (no photo-library permission), QR instead of NFC.
- Tooling deadlines: Play target API 36 (since 31 Aug 2026); Xcode 26 / iOS 26 SDK (since 28 Apr 2026).

Full raw research — one JSON file per agent with every source URL, the fact-checkers' verdicts, and
the palette contrast checker (`node palette-check.mjs`) — is in `design/research-2026-10-10/`.
