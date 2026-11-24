/**
 * Deterministic text screen for emergency limit requests: scam phrases and text aimed at the AI
 * assessor. It runs whether or not the model does, and the policy trusts it over the model.
 */

const SCAM_PATTERNS: [RegExp, string][] = [
  [/gift ?cards?|itunes|google play cards?|steam cards?/i, "gift cards"],
  [/bitcoin|crypto|usdt|tether|wallet address|binance/i, "crypto transfer"],
  [
    /investment (opportunity|scheme|platform)|guaranteed (returns?|profit)|double (my|your|the) money|trading (mentor|coach|group)/i,
    "investment pitch",
  ],
  [
    /(caller|someone|agent|officer|police|irs|tax (office|department)|customs|bank staff|support team)\b.{0,50}\b(asked|told|instructed|said i (must|need)|called)/i,
    "instructed by a third party",
  ],
  [
    /verify (my|your) (account|identity)|unlock (my|your) account|safe account|move (my|the) money to (a|another) account/i,
    "'safe account' / verification request",
  ],
  [/lottery|prize|inheritance|won a|claim (my|your) winnings/i, "prize or inheritance"],
  [/(met|meet).{0,30}online|dating (site|app)|romance/i, "online relationship"],
  [/anydesk|teamviewer|remote access|screen ?share/i, "remote access"],
];

const INJECTION_PATTERNS = [
  /ignore (all |any )?(previous|prior|above|earlier) (instructions|rules|prompts?)/i,
  /system prompt|you are now (a|an|the)\b|developer mode|jailbreak/i,
  /\b(approve|accept) (this|the|my) request\b.{0,40}\b(score|rating|json|confidence)/i,
  /"?(genuine|scam_risk|urgency)"?\s*[:=]\s*[01]/i,
];

export interface TextScreen {
  scamSignals: string[];
  manipulation: boolean;
}

/** Deterministic screen that runs regardless of the model (and can't be talked out of it). */
export function screenText(text: string): TextScreen {
  return {
    scamSignals: SCAM_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label),
    manipulation: INJECTION_PATTERNS.some((re) => re.test(text)),
  };
}
