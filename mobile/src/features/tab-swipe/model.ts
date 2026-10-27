import { TAB_SWIPE } from "./config";

/**
 * +1 for the next tab, −1 for the previous one, 0 to stay, from where the finger went and how fast.
 * A swipe has to be clearly sideways: more than twice as far across as up or down.
 */
export function stepFor(dx: number, vx: number, dy = 0, cfg = TAB_SWIPE): -1 | 0 | 1 {
  if (Math.abs(dx) < Math.abs(dy) * 2) return 0;
  // In "page" mode a leftward swipe (negative dx) moves forward.
  const forward = cfg.direction === "page" ? -1 : 1;
  const d = dx * forward;
  const v = vx * forward;
  if (d > cfg.distance || (d > cfg.activeX && v > cfg.velocity)) return 1;
  if (d < -cfg.distance || (d < -cfg.activeX && v < -cfg.velocity)) return -1;
  return 0;
}

/**
 * How far the screen follows the finger: a third of the way, up to 56 pt, and only a little
 * past either end (where there's no tab to go to).
 */
export function follow(dx: number, canGo: { prev: boolean; next: boolean }, cfg = TAB_SWIPE): number {
  const forward = cfg.direction === "page" ? -1 : 1;
  const towardsNext = dx * forward > 0;
  const allowed = towardsNext ? canGo.next : canGo.prev;
  const limit = allowed ? 56 : 14;
  const eased = dx * (allowed ? 0.35 : 0.12);
  return Math.max(-limit, Math.min(limit, eased));
}

/** The tab a swipe just opened, and the side its content slides in from (+1 right, −1 left). */
let entering: { tab: string; from: 1 | -1 } | null = null;

export function markEntering(tab: string, from: 1 | -1) {
  entering = { tab, from };
}

/** The side `tab` should slide in from, once, if a swipe just opened it. */
export function takeEntering(tab: string): 1 | -1 | null {
  if (entering?.tab !== tab) return null;
  const { from } = entering;
  entering = null;
  return from;
}
