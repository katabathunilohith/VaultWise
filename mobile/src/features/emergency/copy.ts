/**
 * Plain-language copy for the emergency area. The API speaks in internal terms (velocity limit,
 * risk engine, attestation, friction); customers see these words instead (DESIGN.md §5).
 */
import {
  CheckCircleIcon,
  ClockIcon,
  FirstAidKitIcon,
  HourglassIcon,
  InfoIcon,
  WarningCircleIcon,
  XCircleIcon,
  type Icon,
} from "@/components/icons";
import type { Tone } from "@/components/ui";
import type { EmergencyHistoryItem, EmergencyOverview, EmergencyPreview, Guardrail } from "@/lib/api/types";
import { dayWord, fmt, shortDate } from "./format";

/* Reason icons not in the shared icon set (declared exactly like src/components/icons.ts). */
const BandaidsIcon: Icon = require("phosphor-react-native/src/icons/Bandaids").BandaidsIcon;
const BriefcaseIcon: Icon = require("phosphor-react-native/src/icons/Briefcase").BriefcaseIcon;
const AirplaneTiltIcon: Icon = require("phosphor-react-native/src/icons/AirplaneTilt").AirplaneTiltIcon;
const WrenchIcon: Icon = require("phosphor-react-native/src/icons/Wrench").WrenchIcon;
const FlowerLotusIcon: Icon = require("phosphor-react-native/src/icons/FlowerLotus").FlowerLotusIcon;
const DotsThreeCircleIcon: Icon = require("phosphor-react-native/src/icons/DotsThreeCircle").DotsThreeCircleIcon;

export const REASON_ICONS: Record<string, Icon> = {
  medical: FirstAidKitIcon,
  accident: BandaidsIcon,
  job_loss: BriefcaseIcon,
  urgent_travel: AirplaneTiltIcon,
  home_repair: WrenchIcon,
  bereavement: FlowerLotusIcon,
  other: DotsThreeCircleIcon,
};

/** The server's notes must be at least this long when a note is required. */
export const NOTE_MIN = 10;
export const NOTE_MAX = 300;

/* ---------- safety checks ---------- */

export type CheckState = "ok" | "heads-up" | "stops";

export function checkState(g: Guardrail): CheckState {
  if (g.status === "pass") return "ok";
  if (g.status === "warn") return "heads-up";
  return "stops"; // "block" (live) or "fail" (demo)
}

export const CHECK_PILL: Record<CheckState, { tone: Tone; word: string }> = {
  ok: { tone: "success", word: "OK" },
  "heads-up": { tone: "warning", word: "Heads up" },
  stops: { tone: "danger", word: "Stops this" },
};

export interface PlainCheck {
  key: string;
  label: string;
  detail: string;
  state: CheckState;
}

const isFrequency = (key: string) => key === "velocity" || key === "frequency";

/** One safety check in plain words. Unknown checks fall back to the server's text. */
export function plainCheck(g: Guardrail, o: EmergencyOverview, p: EmergencyPreview): PlainCheck {
  const cur = o.currency;
  const state = checkState(g);
  const ok = state === "ok";
  if (g.key === "cap")
    return {
      key: g.key,
      state,
      label: "Monthly safety limit",
      detail: ok
        ? `${fmt(Math.max(0, o.remainingCap - p.amount), cur)} left this month after this`
        : `Only ${fmt(o.remainingCap, cur)} left of this month's ${fmt(o.cap, cur)}`,
    };
  if (isFrequency(g.key))
    return {
      key: g.key,
      state,
      label: "Requests this week",
      detail: ok
        ? `${o.requestsLast7d} of ${o.rules.maxRequestsPer7d} used`
        : `${o.rules.maxRequestsPer7d} requests this week, the most your limit allows`,
    };
  if (g.key === "funds")
    return {
      key: g.key,
      state,
      label: "Money available",
      detail: ok ? (p.tier2 > 0 ? "Health and your other vaults cover it" : "Your Health vault covers it") : `Your vaults are ${fmt(p.shortfall, cur)} short`,
    };
  if (g.key === "cooloff")
    return {
      key: g.key,
      state,
      label: "Recent requests",
      detail: ok
        ? "No recent emergency requests"
        : p.coolingOff
          ? `Several requests in 3 days, so there's a ${o.rules.cooloffHours}-hour pause`
          : "You've used emergency money this month, so add a short note",
    };
  if (g.key === "risk")
    return {
      key: g.key,
      state,
      label: "Account check",
      detail: ok ? "Nothing unusual" : "A person may look at this later. It won't stop your money.",
    };
  return { key: g.key, state, label: g.label, detail: g.detail };
}

/** The reason a request can't go ahead, in plain words, with what to do about it. */
export function blockedReason(checks: Guardrail[], o: EmergencyOverview, p: Pick<EmergencyPreview, "tier1" | "tier2" | "shortfall">) {
  const cur = o.currency;
  const stops = checks.filter((g) => checkState(g) === "stops");
  if (stops.some((g) => isFrequency(g.key)))
    return `You've made ${o.rules.maxRequestsPer7d} emergency requests this week, the most your limit allows. Talk to a person if you still need money.`;
  if (stops.some((g) => g.key === "cap"))
    return o.remainingCap > 0
      ? `You have ${fmt(o.remainingCap, cur)} left of this month's ${fmt(o.cap, cur)} limit. Try that or less, or ask for a higher limit.`
      : `You've used this month's ${fmt(o.cap, cur)} limit. Ask for a higher limit, or talk to a person.`;
  if (stops.some((g) => g.key === "funds"))
    return `Your vaults can cover up to ${fmt(p.tier1 + p.tier2, cur)} right now. Try that or less.`;
  const first = stops[0];
  return first ? first.detail : "A safety limit stops this request. Talk to a person and they'll help.";
}

/** The most someone can ask for right now: what their vaults hold, within this month's limit. */
export function maxRequest(o: EmergencyOverview) {
  return Math.max(0, Math.min(o.remainingCap, o.tier1Available + o.tier2Available));
}

/* ---------- friction (the "next request" row) ---------- */

export function nextRequestText(o: EmergencyOverview) {
  switch (o.friction.level) {
    case 1:
      return "Standard, fastest path";
    case 2:
      return "Needs a short note";
    case 3:
      return `Released after a ${o.rules.cooloffHours}-hour pause`;
    default:
      return o.friction.label;
  }
}

/* ---------- request + receipt status ---------- */

export function requestStatus(h: EmergencyHistoryItem, now = Date.now()): { tone: Tone; label: string; icon?: Icon } {
  switch (h.status) {
    case "released":
      return { tone: "success", label: "Sent", icon: CheckCircleIcon };
    case "processing":
      return h.releaseAt && h.releaseAt > now
        ? { tone: "info", label: "Safety pause", icon: HourglassIcon }
        : { tone: "info", label: "Sending", icon: ClockIcon };
    case "cooling_off":
      return { tone: "neutral", label: h.releaseAt ? `Sends ${shortDate(h.releaseAt)}` : "Paused", icon: ClockIcon };
    case "blocked":
      return { tone: "danger", label: "Not sent", icon: XCircleIcon };
    default:
      return { tone: "neutral", label: h.status, icon: InfoIcon };
  }
}

/** Receipt statuses where the server accepts a (new) receipt. */
const OWED = new Set(["requested", "optional", "overdue", "rejected"]);

export function receiptOwed(h: EmergencyHistoryItem) {
  return h.status !== "blocked" && OWED.has(h.receiptStatus);
}

const OWED_ORDER: Record<string, number> = { overdue: 0, rejected: 1, requested: 2, optional: 3 };

export function owedReceipts(history: EmergencyHistoryItem[]) {
  return history
    .filter(receiptOwed)
    .sort((a, b) => (OWED_ORDER[a.receiptStatus] ?? 9) - (OWED_ORDER[b.receiptStatus] ?? 9) || (a.receiptDueAt ?? 0) - (b.receiptDueAt ?? 0));
}

export function receiptPill(h: EmergencyHistoryItem): { tone: Tone; label: string; icon?: Icon } {
  switch (h.receiptStatus) {
    case "overdue":
      return { tone: "warning", label: "Overdue", icon: WarningCircleIcon };
    case "rejected":
      return { tone: "warning", label: "Needs another", icon: WarningCircleIcon };
    case "requested":
      return { tone: "neutral", label: "Due", icon: ClockIcon };
    case "optional":
      return { tone: "neutral", label: "Optional", icon: InfoIcon };
    case "submitted":
    case "in_review":
      return { tone: "info", label: "Being checked", icon: ClockIcon };
    case "verified":
      return { tone: "success", label: "Receipt OK", icon: CheckCircleIcon };
    default:
      return { tone: "neutral", label: "No receipt needed", icon: InfoIcon };
  }
}

/** "Add by Fri 24 Oct" / "Was due 24 Oct" — always an exact date. */
export function receiptDueText(h: EmergencyHistoryItem, now = Date.now()) {
  if (h.receiptStatus === "rejected") return "The last one didn't pass. Add a clearer or different receipt.";
  if (!h.receiptDueAt) return h.receiptStatus === "optional" ? "Optional. It helps if you have one." : "Add it when you can.";
  if (h.receiptDueAt < now || h.receiptStatus === "overdue") return `Was due ${shortDate(h.receiptDueAt)}. Add it as soon as you can.`;
  const by = dayWord(h.receiptDueAt, now);
  return h.receiptStatus === "optional" ? `Optional. Add it by ${by} if you have one.` : `Add it by ${by}.`;
}

/** For a request whose receipt is already in (or isn't needed). */
export function receiptInText(h: EmergencyHistoryItem) {
  switch (h.receiptStatus) {
    case "submitted":
    case "in_review":
      return "Your receipt is being checked";
    case "verified":
      return "Your receipt has been accepted";
    default:
      return "No receipt is needed for this request";
  }
}

export function tierText(tier: number) {
  return tier >= 2 ? "Tier 2 · other vaults" : "Tier 1 · Health";
}
