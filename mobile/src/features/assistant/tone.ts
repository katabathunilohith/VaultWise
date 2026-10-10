import { useEffect, useRef, useState } from "react";
import { getItem, setItem } from "@/lib/storage";

/**
 * The assistant's voice dial. Straight is the default; Hype and Roast are opt-in.
 * Tone follows stakes: on money that's going out, held, declined or limited, the reply is
 * always Straight, whatever the dial says.
 */
export type Tone = "straight" | "hype" | "roast";

export const TONES: { value: Tone; label: string; hint: string }[] = [
  { value: "straight", label: "Straight", hint: "Calm and brief, numbers first." },
  { value: "hype", label: "Hype", hint: "Cheers your saving wins. Serious topics stay straight." },
  { value: "roast", label: "Roast", hint: "Teases spending only. Health, Emergency and declines stay straight." },
];

const isTone = (v: unknown): v is Tone => v === "straight" || v === "hype" || v === "roast";

/**
 * Appended to the outgoing message only (never shown in the bubble). Worded so it can't trip
 * the demo simulator's keyword matching.
 */
const STYLE: Record<Tone, string> = {
  straight: "Reply style: plain and calm, numbers first, no emoji, no exclamation marks.",
  hype: "Reply style: upbeat and celebratory about saving wins, still accurate. At most one emoji.",
  roast: "Reply style: playful, light teasing about discretionary spending choices only, never mean, still accurate. At most one emoji.",
};

export function withStyle(text: string, tone: Tone) {
  return `${text}\n\n(${STYLE[tone]})`;
}

/** Emergency, declines, limits, debt and missed saving: never Hype, never Roast. */
const CALM_TOPICS =
  /\b(emergenc\w*|urgent\w*|declin\w*|reject\w*|denied|refus\w*|not approved|limits?|caps?|capped|debts?|loans?|owe|owing|overdraft\w*|credit cards?|bnpl|missed|missing|behind|skipp?ed|late|overdue|fell short|short of|frozen|held|stuck)\b/i;
/** Health is never roasted. */
const HEALTH = /\b(health\w*|medical|medicine|doctors?|hospitals?|clinics?|pharmacy|therapy|illness|sick)\b/i;

/**
 * The tone actually used for one message. Looks at this message and the one before it, so a
 * follow-up like "roast me" right after a decline still gets a straight answer.
 */
export function effectiveTone(chosen: Tone, text: string, previousUserText = ""): { tone: Tone; fellBack: boolean } {
  if (chosen === "straight") return { tone: "straight", fellBack: false };
  const hay = `${text}\n${previousUserText}`;
  const sensitive = CALM_TOPICS.test(hay) || (chosen === "roast" && HEALTH.test(hay));
  return sensitive ? { tone: "straight", fellBack: true } : { tone: chosen, fellBack: false };
}

/** Pictographic emoji (plus joiners and variation selectors), and one trailing space. */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]+ ?/gu;

/** Straight mode has no emoji, even if the model adds one. */
export function stripEmoji(text: string) {
  return text.replace(EMOJI, "");
}

const TONE_KEY = "vw.aiTone";

/** The dial position, remembered on this device (choosing Hype or Roast is the opt-in). */
export function useTone() {
  const [tone, setToneState] = useState<Tone>("straight");
  /** Set once the person moves the dial, so a slow read from storage can't undo their choice. */
  const touched = useRef(false);
  useEffect(() => {
    let alive = true;
    void getItem(TONE_KEY).then((v) => {
      if (alive && !touched.current && isTone(v)) setToneState(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  const setTone = (next: Tone) => {
    touched.current = true;
    setToneState(next);
    void setItem(TONE_KEY, next);
  };
  return [tone, setTone] as const;
}
