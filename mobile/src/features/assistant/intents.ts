import type { Href } from "expo-router";
import type { Vault, VaultCategory } from "@/lib/api/types";
import type { SupportTopic } from "./support/topics";

/**
 * Keyword checks on what the person typed. They only decide what extra help to show next to a
 * reply (a button into the normal money flow, a link to a person); they never move money.
 */

const normalise = (text: string) => text.toLowerCase().replace(/[’‘]/g, "'");

// ---------------------------------------------------------------------------------------------
// "Move my money for me" → a card that opens the normal flow

export type MoneyFlow = "add" | "withdraw" | "emergency";

export interface MoneyAction {
  flow: MoneyFlow;
  vaultId?: string;
  vaultName?: string;
}

const MONEY_VERB = /\b(add|put|deposit|move|transfer|send|withdraw|take out|cash out|pull out|release|unlock|pay|top up|top-up)\b/;
const OUT_VERB = /\b(withdraw|take out|cash out|pull out|release|unlock|pay)\b/;
const IN_VERB = /\b(add|put|deposit|top up|top-up)\b/;
const SHIFT_VERB = /\b(move|transfer|send)\b/;
/** Asked of the assistant: an instruction, or "can you / please / for me". */
const STARTS_WITH_VERB = /^(?:(?:please|pls|ok|okay|hey|now|just|go ahead and)\s+)*(add|put|deposit|move|transfer|send|withdraw|take|cash|pull|release|unlock|pay|top)\b/;
const ASKS_ASSISTANT = /\b(can you|could you|would you|will you|please|for me|i want you to|i need you to|go ahead and)\b/;
/** Verbs that only ever mean money. The others ("add", "send", "move"…) need a money word too. */
const MONEY_ONLY_VERB = /\b(withdraw|deposit|cash out|take out|top up|top-up)\b/;
const MONEY_OBJECT = /[\d₹$€£]|\b(money|cash|savings|vaults?|balance|rupees?|dollars?|euros?|pounds?|dirhams?|rs|inr|usd|eur|gbp|aed)\b/;
/** "How do I…", "explain…" are questions about the flow, not requests to run it. */
const EXPLAINER = /\b(explain|tell me|show me how|what happens|how (do|does|can|would|should) (i|you|it|we))\b/;

const CATEGORY_WORDS: Record<VaultCategory, RegExp | null> = {
  health: /\b(health|medical|doctor|hospital|medicine|pharmacy|clinic)\b/,
  education: /\b(education|school|college|uni|university|tuition|course|fees)\b/,
  housing: /\b(housing|house|home|rent|flat|apartment)\b/,
  emergency: /\bemergenc\w*\b/,
  retirement: /\b(retirement|retire|pension)\b/,
  custom: null,
};

function matchVault(segment: string, vaults: Vault[]): Vault | undefined {
  const byName = vaults.find((v) => v.name.trim().length > 2 && segment.includes(v.name.trim().toLowerCase()));
  if (byName) return byName;
  return vaults.find((v) => CATEGORY_WORDS[v.category]?.test(segment));
}

/** The part of the sentence after a preposition ("…to my Health vault"), or "" if absent. */
function after(text: string, words: RegExp) {
  const m = words.exec(text);
  return m ? text.slice(m.index + m[0].length) : "";
}

/** "I need emergency money", "get me emergency cash". */
const EMERGENCY_ASK = /\b(need|get|want|request|release|send)\b.*\bemergency (money|cash|payout|withdrawal)\b/;

export function detectMoneyAction(text: string, vaults: Vault[] = []): MoneyAction | null {
  const t = normalise(text).trim();
  if (EXPLAINER.test(t)) return null;
  if (EMERGENCY_ASK.test(t)) return { flow: "emergency" };
  if (!MONEY_VERB.test(t)) return null;
  if (!STARTS_WITH_VERB.test(t) && !ASKS_ASSISTANT.test(t)) return null;
  // "Add a goal", "send me tips": not about moving money.
  if (!MONEY_ONLY_VERB.test(t) && !MONEY_OBJECT.test(t) && !matchVault(t, vaults)) return null;

  const toPart = after(t, /\b(to|into)\b/);
  const fromPart = after(t, /\bfrom\b/);
  const mentionsEmergency = /\bemergenc/.test(t);

  let flow: MoneyFlow;
  let vault: Vault | undefined;
  if (IN_VERB.test(t)) {
    flow = "add";
    vault = matchVault(toPart || t, vaults);
  } else if (OUT_VERB.test(t)) {
    flow = mentionsEmergency ? "emergency" : "withdraw";
    vault = matchVault(fromPart || t, vaults);
  } else if (SHIFT_VERB.test(t)) {
    const into = toPart ? matchVault(toPart, vaults) : undefined;
    if (into) {
      flow = "add";
      vault = into;
    } else {
      // Sending to someone who isn't a vault ("send 500 to mom") is money going out.
      flow = mentionsEmergency && !toPart ? "emergency" : fromPart || toPart ? "withdraw" : "add";
      vault = matchVault(fromPart || t, vaults);
    }
  } else {
    return null;
  }
  if (flow === "emergency") return { flow };
  return vault ? { flow, vaultId: vault.id, vaultName: vault.name } : { flow };
}

export function actionLabel(a: MoneyAction) {
  if (a.flow === "emergency") return "Request emergency money";
  if (a.flow === "add") return a.vaultName ? `Add money to ${a.vaultName}` : "Add money";
  return a.vaultName ? `Withdraw from ${a.vaultName}` : "Withdraw with proof";
}

/** The normal flow for this action. Without a named vault, the flow asks which one ("choose"). */
export function actionHref(a: MoneyAction): Href {
  if (a.flow === "emergency") return "/emergency-request";
  if (a.flow === "add") return { pathname: "/add-money/[vaultId]", params: { vaultId: a.vaultId ?? "choose" } };
  return { pathname: "/withdraw/[vaultId]", params: { vaultId: a.vaultId ?? "choose" } };
}

// ---------------------------------------------------------------------------------------------
// When to offer a person straight away

const URGENT: { re: RegExp; topic: SupportTopic }[] = [
  { re: /\b(fraud\w*|scam\w*|hack(ed)?|stolen|phish\w*|unauthori[sz]ed)\b/, topic: "other" },
  { re: /\bemergenc\w*\b/, topic: "emergency" },
  { re: /\b(locked|frozen|freeze|froze|blocked|stuck|can't access|cannot access)\b/, topic: "held" },
  {
    re: /\b(missing|disappeared|vanished|gone|lost)\b.*\bmoney\b|\bmoney\b.*\b(missing|disappeared|vanished|gone|lost)\b|\bwhere('s| is) my money\b|\b(didn't|never) (arrive|come|land|show)\b/,
    topic: "held",
  },
];

/** Money missing, fraud or scams, locked or frozen money, emergencies: show "Talk to a person" now. */
export function urgentTopic(text: string): SupportTopic | null {
  const t = normalise(text);
  return URGENT.find((u) => u.re.test(t))?.topic ?? null;
}

/** Best guess at a support topic from the chat, for pre-filling the support form. */
export function guessTopic(text: string): SupportTopic | undefined {
  const t = normalise(text);
  if (/\b(proof|declin\w*|receipt|invoice|document|verif\w*|review)\b/.test(t)) return "proof";
  if (/\bemergenc/.test(t)) return "emergency";
  if (/\b(pay|payment|checkout|merchant|refund)\b/.test(t)) return "payment";
  if (/\b(held|hold|locked|frozen|stuck|missing|pending)\b/.test(t)) return "held";
  return undefined;
}
