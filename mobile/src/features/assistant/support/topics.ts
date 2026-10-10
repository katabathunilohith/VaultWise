/** What a support case is about. Shared by the support screen and the assistant hand-over. */
export type SupportTopic = "held" | "proof" | "emergency" | "payment" | "other";

export const TOPICS: { key: SupportTopic; label: string }[] = [
  { key: "held", label: "Money held" },
  { key: "proof", label: "Proof decision" },
  { key: "emergency", label: "Emergency" },
  { key: "payment", label: "Payment" },
  { key: "other", label: "Something else" },
];

const ALIASES: Record<string, SupportTopic> = {
  held: "held",
  hold: "held",
  "money-held": "held",
  money: "held",
  proof: "proof",
  decision: "proof",
  verification: "proof",
  emergency: "emergency",
  payment: "payment",
  pay: "payment",
  checkout: "payment",
  other: "other",
  else: "other",
};

/** Reads a `?topic=` route param. Unknown values are ignored rather than guessed. */
export function parseTopic(value: unknown): SupportTopic | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string") return undefined;
  return ALIASES[v.trim().toLowerCase()];
}

export function topicLabel(topic: SupportTopic) {
  return TOPICS.find((t) => t.key === topic)?.label ?? "Something else";
}

/** Keeps a `?ref=` param to a short id-like string so nothing odd reaches the screen or storage. */
export function parseRef(value: unknown): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string") return undefined;
  const clean = v.replace(/[^\w.-]/g, "").slice(0, 64);
  return clean || undefined;
}
