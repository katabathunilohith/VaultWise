import { AndroidHaptics } from "expo-haptics";
import type { PulsarPattern } from "./pulsar";

/**
 * The Vaultwise haptic vocabulary. Each token has one meaning and is used for nothing else.
 *
 * Sources (see research notes in the repo's design brief):
 * - Apple HIG "Playing haptics": use system haptics for their documented meanings, be
 *   consistent, complement visuals, avoid overuse, make haptics optional.
 * - Android haptics principles: prefer crisp HapticFeedbackConstants over buzzy vibration;
 *   ≤3 intensity levels at ≥1.4× steps; ≥50 ms between onsets.
 * - Kaaresoja, Brewster & Lantz 2014: touch feedback should start within ~50 ms.
 * - Hoggan, Brewster & Johnston 2008: tactile key feedback improves touchscreen entry (PIN pad).
 * - Seifi & MacLean 2013: slow, low-sharpness rhythms read as calm (waiting states).
 * Ethics: saving, proof and security may delight; spending and trading may not. Payment success
 * is the plain system success, never more ornate than a saving moment. No haptics on practice
 * trades, price moves, streaks, chat streaming or push notifications. Every token is deterministic.
 *
 * Recipes are starting values to tune on real devices (iPhone + a Pixel/Galaxy), not vendor values.
 */

export type IosStep =
  | { kind: "impact"; style: "light" | "medium" | "heavy" | "soft" | "rigid" }
  | { kind: "notification"; type: "success" | "warning" | "error" }
  | { kind: "selection" };

/** Android: try system constants in order (each needs a minimum API level), then fall back. */
export interface AndroidStep {
  candidates: { type: AndroidHaptics; minApi: number }[];
  fallback: IosStep | null;
}

export interface Step {
  at: number;
  ios: IosStep | null;
  android: AndroidStep | null;
}

/** E: plays at Subtle and Full · S: Subtle plays the first beat only · X: Full only. */
export type Tier = "E" | "S" | "X";
/** Higher channels cancel lower ones that are still playing. */
export type Channel = "tick" | "expressive" | "outcome" | "commit";

export interface Token {
  tier: Tier;
  channel: Channel;
  minIntervalMs: number;
  /** Fallback recipe using expo-haptics only (works in Expo Go). */
  steps: Step[];
  /** Richer Core Haptics / Composition recipe, used when Pulsar is available. time = ms, amplitude = intensity, frequency = sharpness. */
  rich?: PulsarPattern;
  /** Touch tokens: fired at touch-down from the gesture itself. */
  touch?: boolean;
}

const I = (style: "light" | "medium" | "heavy" | "soft" | "rigid"): IosStep => ({ kind: "impact", style });
const N = (type: "success" | "warning" | "error"): IosStep => ({ kind: "notification", type });
const SEL: IosStep = { kind: "selection" };
const A = (candidates: [AndroidHaptics, number][], fallback: IosStep | null): AndroidStep => ({
  candidates: candidates.map(([type, minApi]) => ({ type, minApi })),
  fallback,
});
const step = (at: number, ios: IosStep | null, android: AndroidStep | null): Step => ({ at, ios, android });
const discrete = (...events: [number, number, number][]): PulsarPattern => ({
  discretePattern: events.map(([time, amplitude, frequency]) => ({ time, amplitude, frequency })),
  continuousPattern: { amplitude: [], frequency: [] },
});

const TICK_ANDROID = A([[AndroidHaptics.Segment_Tick, 34], [AndroidHaptics.Clock_Tick, 21]], SEL);

export const TOKENS = {
  /** Touch-down on a primary call to action (Add money, Continue, Submit proof). */
  "tap.primary": { tier: "X", channel: "tick", minIntervalMs: 100, touch: true, steps: [step(0, I("light"), A([[AndroidHaptics.Virtual_Key, 5]], I("light")))] },
  /** Selection moved: segmented control, chip, picker, reason grid. */
  "select.tick": { tier: "S", channel: "tick", minIntervalMs: 50, touch: true, steps: [step(0, SEL, TICK_ANDROID)] },
  /** Tab change (Full only; tabs are frequent). */
  "tab.change": { tier: "X", channel: "tick", minIntervalMs: 80, touch: true, steps: [step(0, SEL, TICK_ANDROID)] },
  "toggle.on": { tier: "E", channel: "tick", minIntervalMs: 150, touch: true, steps: [step(0, I("rigid"), A([[AndroidHaptics.Toggle_On, 34], [AndroidHaptics.Clock_Tick, 21]], I("light")))] },
  "toggle.off": { tier: "E", channel: "tick", minIntervalMs: 150, touch: true, steps: [step(0, I("soft"), A([[AndroidHaptics.Toggle_Off, 34], [AndroidHaptics.Clock_Tick, 21]], I("soft")))] },
  /** Amount or goal slider crosses a step. */
  "slider.detent": { tier: "S", channel: "tick", minIntervalMs: 50, touch: true, steps: [step(0, SEL, A([[AndroidHaptics.Segment_Frequent_Tick, 34], [AndroidHaptics.Clock_Tick, 21]], SEL))] },
  /** Slider hits its minimum, maximum or a personal limit. */
  "slider.edge": { tier: "S", channel: "tick", minIntervalMs: 300, touch: true, steps: [step(0, I("rigid"), A([[AndroidHaptics.Context_Click, 23]], I("rigid")))], rich: discrete([0, 0.8, 0.9]) },
  "drag.pickup": { tier: "S", channel: "tick", minIntervalMs: 300, touch: true, steps: [step(0, I("medium"), A([[AndroidHaptics.Drag_Start, 34], [AndroidHaptics.Long_Press, 3]], I("medium")))] },
  "drag.drop": { tier: "S", channel: "tick", minIntervalMs: 300, touch: true, steps: [step(0, I("soft"), A([[AndroidHaptics.Gesture_End, 30], [AndroidHaptics.Clock_Tick, 21]], I("soft")))] },
  "longpress.menu": { tier: "S", channel: "tick", minIntervalMs: 300, touch: true, steps: [step(0, I("medium"), A([[AndroidHaptics.Long_Press, 3]], I("medium")))] },
  /** Pull-to-refresh crosses its arm point. */
  "pull.threshold": { tier: "S", channel: "tick", minIntervalMs: 300, touch: true, steps: [step(0, I("light"), TICK_ANDROID)] },
  /** Row swipe crosses its commit point. */
  "swipe.commit": { tier: "S", channel: "tick", minIntervalMs: 300, touch: true, steps: [step(0, I("medium"), TICK_ANDROID)] },
  /** PIN pad and amount keypad keys. Identical for every digit. */
  "pin.digit": { tier: "E", channel: "tick", minIntervalMs: 0, touch: true, steps: [step(0, I("light"), A([[AndroidHaptics.Virtual_Key, 5]], I("light")))] },
  "pin.wrong": { tier: "E", channel: "outcome", minIntervalMs: 800, steps: [step(0, N("error"), A([[AndroidHaptics.Reject, 30]], N("error")))] },
  /** App unlocked: a light two-beat "latch". */
  "unlock.success": {
    tier: "E",
    channel: "outcome",
    minIntervalMs: 30_000,
    steps: [step(0, I("light"), A([[AndroidHaptics.Confirm, 30]], I("light"))), step(70, I("rigid"), null)],
    rich: discrete([0, 0.4, 0.5], [70, 0.6, 0.8]),
  },
  /** Money lands in a vault: a decaying three-beat bounce, synced to the coin hitting the vault. */
  "deposit.coinDrop": {
    tier: "S",
    channel: "expressive",
    minIntervalMs: 2000,
    steps: [step(0, I("rigid"), A([[AndroidHaptics.Confirm, 30]], I("rigid"))), step(80, I("light"), null)],
    rich: discrete([0, 0.75, 0.9], [70, 0.45, 0.85], [115, 0.25, 0.8]),
  },
  /** Vault crosses 25 / 50 / 75%: a short swell, then a hit as the ring closes (Opal-style reveal, saving only). */
  "goal.milestone": {
    tier: "S",
    channel: "expressive",
    minIntervalMs: 2000,
    steps: [step(0, I("soft"), A([[AndroidHaptics.Confirm, 30]], I("medium"))), step(120, I("medium"), null)],
    rich: {
      discretePattern: [
        { time: 420, amplitude: 1.0, frequency: 0.7 },
        { time: 560, amplitude: 0.45, frequency: 0.4 },
      ],
      continuousPattern: {
        amplitude: [
          { time: 0, value: 0.1 },
          { time: 400, value: 0.5 },
          { time: 410, value: 0 },
        ],
        frequency: [
          { time: 0, value: 0.3 },
          { time: 410, value: 0.3 },
        ],
      },
    },
  },
  /** Vault reaches 100%: the milestone plus a final settle. */
  "goal.reached": {
    tier: "S",
    channel: "expressive",
    minIntervalMs: 2000,
    steps: [step(0, N("success"), A([[AndroidHaptics.Confirm, 30]], N("success"))), step(200, I("medium"), null)],
    rich: {
      discretePattern: [
        { time: 420, amplitude: 1.0, frequency: 0.7 },
        { time: 560, amplitude: 0.45, frequency: 0.4 },
        { time: 700, amplitude: 0.3, frequency: 0.4 },
      ],
      continuousPattern: {
        amplitude: [
          { time: 0, value: 0.1 },
          { time: 400, value: 0.5 },
          { time: 410, value: 0 },
        ],
        frequency: [
          { time: 0, value: 0.3 },
          { time: 410, value: 0.3 },
        ],
      },
    },
  },
  /** A new vault is locked in (a saving moment; plain success, not a milestone pattern). */
  "vault.locked": { tier: "E", channel: "outcome", minIntervalMs: 2000, steps: [step(0, N("success"), A([[AndroidHaptics.Confirm, 30]], N("success")))] },
  /** While the proof pipeline runs and its screen is visible: a slow, soft heartbeat. Max 6 beats. */
  "proof.verifying": { tier: "X", channel: "expressive", minIntervalMs: 1000, steps: [], rich: discrete([0, 0.35, 0.2], [140, 0.22, 0.2]) },
  "proof.approved": { tier: "E", channel: "outcome", minIntervalMs: 1000, steps: [step(0, N("success"), A([[AndroidHaptics.Confirm, 30]], N("success")))] },
  /** Handed to a person: a neutral "set down", deliberately not the warning pattern. */
  "proof.review": {
    tier: "E",
    channel: "outcome",
    minIntervalMs: 1000,
    steps: [step(0, I("soft"), A([[AndroidHaptics.Gesture_End, 30], [AndroidHaptics.Clock_Tick, 21]], I("soft")))],
    rich: discrete([0, 0.5, 0.3], [120, 0.3, 0.3]),
  },
  "proof.declined": { tier: "E", channel: "outcome", minIntervalMs: 1000, steps: [step(0, N("error"), A([[AndroidHaptics.Reject, 30]], N("error")))] },
  /** Tier 2 safety pause: one tick at the start and in the last 5 seconds only. */
  "emergency.tick": { tier: "X", channel: "tick", minIntervalMs: 900, steps: [step(0, SEL, A([[AndroidHaptics.Clock_Tick, 21]], SEL))], rich: discrete([0, 0.35, 0.8]) },
  "emergency.finalTick": { tier: "E", channel: "tick", minIntervalMs: 900, steps: [step(0, I("rigid"), A([[AndroidHaptics.Clock_Tick, 21]], I("rigid")))], rich: discrete([0, 0.6, 0.8]) },
  /** The moment an irreversible action commits: a thud, then a latch. Only after explicit confirm UI. */
  "irreversible.commit": {
    tier: "E",
    channel: "commit",
    minIntervalMs: 2000,
    steps: [
      step(0, I("heavy"), A([[AndroidHaptics.Long_Press, 3]], I("heavy"))),
      step(90, I("rigid"), A([[AndroidHaptics.Confirm, 30], [AndroidHaptics.Clock_Tick, 21]], I("rigid"))),
    ],
    rich: discrete([0, 1.0, 0.25], [90, 0.75, 0.9]),
  },
  /** Pay with Vaultwise confirmed. Plain system success, no flourish. */
  "pay.success": { tier: "E", channel: "outcome", minIntervalMs: 1000, steps: [step(0, N("success"), A([[AndroidHaptics.Confirm, 30]], N("success")))] },
  /** Close to a limit, a guardrail engaged, a low-quality photo, a vault/merchant mismatch. */
  warning: {
    tier: "E",
    channel: "outcome",
    minIntervalMs: 5000,
    steps: [step(0, N("warning"), A([[AndroidHaptics.Clock_Tick, 21]], N("warning"))), step(100, null, A([[AndroidHaptics.Clock_Tick, 21]], null))],
    rich: discrete([0, 0.7, 0.6], [100, 0.7, 0.6]),
  },
  /** Submit failed, network failure, capture failed. On submit only, never per keystroke. */
  error: { tier: "E", channel: "outcome", minIntervalMs: 2000, steps: [step(0, N("error"), A([[AndroidHaptics.Reject, 30]], N("error")))] },
} satisfies Record<string, Token>;

export type TokenName = keyof typeof TOKENS;

/** Press-and-hold to pay (800 ms): a rising ramp with two ticks, then irreversible.commit. */
export const HOLD_MS = 800;
export const HOLD_RICH: PulsarPattern = {
  discretePattern: [
    { time: 266, amplitude: 0.35, frequency: 0.7 },
    { time: 533, amplitude: 0.5, frequency: 0.7 },
  ],
  continuousPattern: {
    amplitude: [
      { time: 0, value: 0.15 },
      { time: 780, value: 0.6 },
      { time: 800, value: 0 },
    ],
    frequency: [
      { time: 0, value: 0.3 },
      { time: 800, value: 0.6 },
    ],
  },
};
export const HOLD_BASIC: Step[] = [step(0, I("light"), TICK_ANDROID), step(400, I("medium"), TICK_ANDROID)];
