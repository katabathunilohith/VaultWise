/** Swiping between tabs. Everything that tunes it lives here. */
export const TAB_SWIPE = {
  enabled: true,
  /**
   * "page": swipe left for the next tab and right for the previous one, like turning a page
   * (Home, swipe left, Vaults). "reverse" flips that.
   */
  direction: "page" as "page" | "reverse",
  /** A swipe changes tab once it travels this far (pt) or flicks this fast (pt per second). */
  distance: 72,
  velocity: 650,
  /** How far the finger must move sideways before it counts as a swipe, and how far up or down cancels it. */
  activeX: 24,
  cancelY: 14,
};
