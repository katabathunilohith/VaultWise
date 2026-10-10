import type { HapticLevel, TokenName } from "@/lib/haptics";

/** Plain-words names for every haptic, grouped for the "Try them" list. */
export type HapticGroup = "Touch" | "Security" | "Saving" | "Proof" | "Emergency & pay" | "Alerts";

export const HAPTIC_GROUPS: HapticGroup[] = ["Touch", "Security", "Saving", "Proof", "Emergency & pay", "Alerts"];

/** Typed against TokenName, so a new token can't ship without a description here. */
export const HAPTIC_CATALOG: Record<TokenName, { group: HapticGroup; label: string; body: string }> = {
  "tap.primary": { group: "Touch", label: "Main button", body: "A light tap as you press a main button." },
  "select.tick": { group: "Touch", label: "Choosing an option", body: "A tick when you pick a chip, tab or option." },
  "tab.change": { group: "Touch", label: "Switching tabs", body: "A tick as you move between tabs. Full only." },
  "toggle.on": { group: "Touch", label: "Switch on", body: "A firm click when you turn something on." },
  "toggle.off": { group: "Touch", label: "Switch off", body: "A softer click when you turn something off." },
  "slider.detent": { group: "Touch", label: "Slider step", body: "A tick at each step of a slider." },
  "slider.edge": { group: "Touch", label: "Slider end", body: "A knock when a slider hits its end or your limit." },
  "longpress.menu": { group: "Touch", label: "Shortcut menu", body: "A press when a long-press menu opens." },
  "drag.pickup": { group: "Touch", label: "Pick up", body: "When you pick something up to move it." },
  "drag.drop": { group: "Touch", label: "Put down", body: "When you drop it in its new place." },
  "pull.threshold": { group: "Touch", label: "Pull to refresh", body: "When you've pulled far enough to refresh." },
  "swipe.commit": { group: "Touch", label: "Swipe action", body: "When a swipe has gone far enough to act." },
  "pin.digit": { group: "Security", label: "PIN key", body: "The same light tap for every key." },
  "pin.wrong": { group: "Security", label: "Wrong PIN", body: "A short buzz when a PIN isn't right." },
  "unlock.success": { group: "Security", label: "Unlocked", body: "A light two-beat latch as Vaultwise opens." },
  "irreversible.commit": { group: "Security", label: "Can't be undone", body: "A thud, then a latch, when something final goes through." },
  "deposit.coinDrop": { group: "Saving", label: "Money in", body: "A small bounce as money lands in a vault." },
  "vault.locked": { group: "Saving", label: "Vault locked in", body: "A plain success when you create a new vault." },
  "goal.milestone": { group: "Saving", label: "Milestone", body: "A swell when a vault passes 25, 50 or 75%." },
  "goal.reached": { group: "Saving", label: "Goal reached", body: "The milestone, plus a final settle at 100%." },
  "proof.verifying": { group: "Proof", label: "Checking", body: "A slow, soft heartbeat while your proof is checked. Six beats at most." },
  "proof.approved": { group: "Proof", label: "Approved", body: "A clear success when your proof is accepted." },
  "proof.review": { group: "Proof", label: "With a person", body: "A gentle set-down when a person takes a look." },
  "proof.declined": { group: "Proof", label: "Not approved", body: "A short buzz when proof isn't accepted." },
  "emergency.tick": { group: "Emergency & pay", label: "Safety pause starts", body: "One tick as a safety pause begins." },
  "emergency.finalTick": { group: "Emergency & pay", label: "Last seconds", body: "A tick in each of the last 5 seconds of a pause." },
  "pay.success": { group: "Emergency & pay", label: "Paid", body: "A plain success when a payment goes through." },
  warning: { group: "Alerts", label: "Heads-up", body: "Two taps near a limit, or when something needs a look." },
  error: { group: "Alerts", label: "Didn't go through", body: "A buzz when something you sent fails." },
};

export const HAPTIC_LEVELS: { value: HapticLevel; label: string; body: string }[] = [
  { value: "off", label: "Off", body: "No vibration from Vaultwise. Everything still shows on screen." },
  { value: "subtle", label: "Subtle", body: "Only the ones that tell you something: security, results and alerts." },
  { value: "full", label: "Full", body: "Every touch, plus richer patterns for saving and proof." },
];

export const hapticLevelLabel = (l: HapticLevel) => HAPTIC_LEVELS.find((x) => x.value === l)?.label ?? "Full";
