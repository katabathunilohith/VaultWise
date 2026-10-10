import * as Haptics from "expo-haptics";
import { AccessibilityInfo, Platform } from "react-native";
import { getItem, KEYS, setItem } from "../storage";
import { pulsar, type PulsarPattern } from "./pulsar";
import { HOLD_BASIC, HOLD_MS, HOLD_RICH, TOKENS, type Channel, type IosStep, type Step, type Token, type TokenName } from "./tokens";

/**
 * Plays haptic tokens. All haptics in the app go through here (no direct expo-haptics calls).
 * - Off / Subtle / Full in-app level, on top of the OS settings (which still win).
 * - Reduce Motion keeps transients and drops continuous swells.
 * - At least 50 ms between onsets; per-token minimum intervals; one expressive pattern at a time;
 *   a higher channel cancels a lower one still playing.
 * - A session soft cap: more than 40 non-touch haptics in 10 minutes drops to Subtle, until the
 *   10-minute window has room again. Only haptics that actually play count.
 * - Calls never throw; feedback must not break a flow. A haptic is never the only signal.
 */

export type HapticLevel = "off" | "subtle" | "full";
export type Backend = "pulsar" | "expo" | "web" | "none";

const PRIORITY: Record<Channel, number> = { tick: 0, expressive: 1, outcome: 2, commit: 3 };
const MIN_GAP_MS = 50;
const SESSION_WINDOW_MS = 10 * 60_000;
const SESSION_CAP = 40;

let level: HapticLevel = "full";
let reduceMotion = false;
let sessionCapped = false;
let lastOnset = 0;
const lastByToken = new Map<string, number>();
const recentNonTouch: number[] = [];
const listeners = new Set<() => void>();

let active: { channel: Channel; cancel: () => void } | null = null;
const patternIds = new Map<string, number>();

const apiLevel = Platform.OS === "android" ? (typeof Platform.Version === "number" ? Platform.Version : Number(Platform.Version)) : 0;
const usePulsar = !!pulsar && pulsar.support >= 2;

export function backend(): Backend {
  if (usePulsar) return "pulsar";
  if (Platform.OS === "ios" || Platform.OS === "android") return "expo";
  if (Platform.OS === "web") return "web";
  return "none";
}

/* ---------- level & settings ---------- */

export function getHapticLevel() {
  return level;
}

export function subscribeHaptics(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function setHapticLevel(next: HapticLevel) {
  level = next;
  // Choosing a level starts the session count again.
  recentNonTouch.length = 0;
  sessionCapped = false;
  pulsar?.enable(next !== "off");
  listeners.forEach((fn) => fn());
  await setItem(KEYS.haptics, next);
}

export async function initHaptics() {
  const saved = (await getItem(KEYS.haptics)) as HapticLevel | null;
  if (saved === "off" || saved === "subtle" || saved === "full") level = saved;
  pulsar?.enable(level !== "off");
  try {
    reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
    AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => {
      reduceMotion = v;
    });
  } catch {
    reduceMotion = false;
  }
}

/** Drops non-touch haptics older than the window; the cap lifts once the window has room again. */
function pruneSession(now: number) {
  while (recentNonTouch.length && now - recentNonTouch[0] > SESSION_WINDOW_MS) recentNonTouch.shift();
  sessionCapped = recentNonTouch.length > SESSION_CAP;
}

function effectiveLevel(): HapticLevel {
  pruneSession(Date.now());
  if (level === "full" && sessionCapped) return "subtle";
  return level;
}

/* ---------- primitive dispatch ---------- */

const IMPACT: Record<string, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
  soft: Haptics.ImpactFeedbackStyle.Soft,
  rigid: Haptics.ImpactFeedbackStyle.Rigid,
};
const NOTIFY: Record<string, Haptics.NotificationFeedbackType> = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
};
const WEB_MS: Record<string, number> = { light: 8, soft: 8, selection: 5, medium: 14, rigid: 12, heavy: 22, success: 18, warning: 24, error: 30 };

const swallow = (p: Promise<unknown>) => {
  p.catch((e) => {
    if (__DEV__) console.debug("[haptics]", (e as Error)?.message);
  });
};

function fireIos(s: IosStep) {
  if (s.kind === "impact") swallow(Haptics.impactAsync(IMPACT[s.style]));
  else if (s.kind === "notification") swallow(Haptics.notificationAsync(NOTIFY[s.type]));
  else swallow(Haptics.selectionAsync());
}

function fireStep(s: Step) {
  try {
    if (Platform.OS === "ios") {
      if (s.ios) fireIos(s.ios);
    } else if (Platform.OS === "android") {
      if (!s.android) return;
      const hit = s.android.candidates.find((c) => apiLevel >= c.minApi);
      if (hit) swallow(Haptics.performAndroidHapticsAsync(hit.type));
      else if (s.android.fallback) fireIos(s.android.fallback);
    } else if (Platform.OS === "web" && s.ios) {
      const key = s.ios.kind === "impact" ? s.ios.style : s.ios.kind === "notification" ? s.ios.type : "selection";
      const nav = globalThis.navigator as (Navigator & { userActivation?: { hasBeenActive: boolean } }) | undefined;
      // Browsers block vibration until the person has interacted with the page; don't ask before then.
      if (nav?.userActivation && !nav.userActivation.hasBeenActive) return;
      nav?.vibrate?.(WEB_MS[key] ?? 10);
    }
  } catch {
    // never break the flow
  }
}

function richFor(name: string, pattern: PulsarPattern) {
  const key = reduceMotion ? `${name}#rm` : name;
  let id = patternIds.get(key);
  if (id === undefined && pulsar) {
    const p = reduceMotion ? { ...pattern, continuousPattern: { amplitude: [], frequency: [] } } : pattern;
    try {
      id = pulsar.parse(p);
      patternIds.set(key, id);
    } catch {
      return null;
    }
  }
  return id ?? null;
}

/* ---------- playback ---------- */

/** Whether this platform has anything to play for a step (fireStep would otherwise do nothing). */
function playable(s: Step) {
  if (Platform.OS === "ios") return !!s.ios;
  if (Platform.OS === "android") return !!s.android && (s.android.candidates.some((c) => apiLevel >= c.minApi) || !!s.android.fallback);
  if (Platform.OS === "web") return !!s.ios && typeof (globalThis.navigator as { vibrate?: unknown } | undefined)?.vibrate === "function";
  return false;
}

/** The expo-haptics steps a token plays at this level, leaving out what this platform can't play. */
function basicSteps(token: Token, firstOnly: boolean) {
  return (firstOnly || reduceMotion ? token.steps.slice(0, 1) : token.steps).filter(playable);
}

/** The Pulsar pattern id for a token, when the rich path applies here; null otherwise. */
function richId(name: string, token: Token, firstOnly: boolean) {
  if (!usePulsar || !pulsar || !token.rich || firstOnly) return null;
  return richFor(name, token.rich);
}

/**
 * Whether a token would make the device do anything here. A token with only a Pulsar recipe
 * (proof.verifying) is silent without Pulsar (Expo Go, web), and silent haptics must not count
 * toward the rate limits or the session cap.
 */
function canPlay(name: string, token: Token, lvl: HapticLevel) {
  const firstOnly = lvl === "subtle" && token.tier === "S";
  return richId(name, token, firstOnly) !== null || basicSteps(token, firstOnly).length > 0;
}

function schedule(name: string, token: Token, lvl: HapticLevel): (() => void) | null {
  const firstOnly = lvl === "subtle" && token.tier === "S";
  const p = pulsar;
  const id = richId(name, token, firstOnly);
  if (p && id !== null) {
    try {
      p.play(id);
      return () => p.stop(id);
    } catch {
      // fall through to expo-haptics
    }
  }
  const steps = basicSteps(token, firstOnly);
  if (!steps.length) return null;
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (const s of steps) {
    if (s.at <= 0) fireStep(s);
    else timers.push(setTimeout(() => fireStep(s), s.at));
  }
  return () => timers.forEach(clearTimeout);
}

function allowed(token: Token, lvl: HapticLevel) {
  if (lvl === "off") return false;
  if (lvl === "subtle" && token.tier === "X") return false;
  return true;
}

/**
 * Plays a named token. Returns false when skipped (level, rate limit, priority).
 * Fire it on the same frame as the visual change it belongs to.
 */
export function haptic(name: TokenName): boolean {
  const token = TOKENS[name] as Token;
  const lvl = effectiveLevel();
  if (!allowed(token, lvl)) return false;
  const now = Date.now();
  const higher = active && PRIORITY[token.channel] > PRIORITY[active.channel];
  if (!higher && now - lastOnset < MIN_GAP_MS) return false;
  if (now - (lastByToken.get(name) ?? 0) < token.minIntervalMs) return false;
  if (active && !higher && token.channel === "expressive" && active.channel === "expressive") return false;
  // Nothing to play on this device: skip it without using up the gap, the interval or the cap.
  if (!canPlay(name, token, lvl)) return false;
  if (higher) active?.cancel();
  if (!token.touch) {
    recentNonTouch.push(now);
    pruneSession(now);
  }
  lastOnset = now;
  lastByToken.set(name, now);
  const cancel = schedule(name, token, lvl);
  if (cancel) {
    const entry = { channel: token.channel, cancel };
    active = entry;
    const longest = Math.max(token.rich ? 900 : 0, ...token.steps.map((s) => s.at)) + 60;
    setTimeout(() => {
      if (active === entry) active = null;
    }, longest);
  }
  return true;
}

/** Plays a token regardless of rate limits — for the haptics preview in Settings. */
export function previewHaptic(name: TokenName) {
  const token = TOKENS[name] as Token;
  const lvl = level === "off" ? "full" : level;
  active?.cancel();
  active = null;
  schedule(name, token, lvl);
}

/**
 * Press-and-hold to confirm a payment. start() on press-in, cancel() if released early,
 * commit() when the hold completes (plays irreversible.commit).
 */
export function createHold() {
  let stopFn: (() => void) | null = null;
  return {
    durationMs: HOLD_MS,
    start() {
      const lvl = effectiveLevel();
      if (lvl === "off") return;
      if (lvl === "subtle") {
        fireStep(HOLD_BASIC[0]);
        return;
      }
      const p = pulsar;
      if (usePulsar && p) {
        const id = richFor("pay.hold", HOLD_RICH);
        if (id !== null) {
          p.play(id);
          stopFn = () => p.stop(id);
          return;
        }
      }
      const timers = HOLD_BASIC.map((s) => (s.at <= 0 ? (fireStep(s), null) : setTimeout(() => fireStep(s), s.at))).filter(Boolean) as ReturnType<
        typeof setTimeout
      >[];
      stopFn = () => timers.forEach(clearTimeout);
    },
    cancel() {
      stopFn?.();
      stopFn = null;
      if (effectiveLevel() === "full") fireStep({ at: 0, ios: { kind: "impact", style: "soft" }, android: null });
    },
    commit() {
      stopFn?.();
      stopFn = null;
      haptic("irreversible.commit");
    },
    /** End the ramp quietly (the commit haptic will be played later by the caller). */
    stop() {
      stopFn?.();
      stopFn = null;
    },
  };
}
