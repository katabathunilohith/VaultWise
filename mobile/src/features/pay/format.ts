import type { Minor } from "@/lib/api/types";
import { money, moneyWhole } from "@/lib/money";

/** "₹23,800" when the amount is whole, "₹1,180.50" otherwise — keeps hold labels and headlines short. */
export function payAmount(amount: Minor, currency: string) {
  return amount % 100 === 0 ? moneyWhole(amount, currency) : money(amount, currency);
}

/** Two-letter initials for a merchant or person ("City General Hospital" → "CG"). */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "?";
}

/** "3:40 pm" — exact times beat ranges. */
export function clockTime(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "10 Oct, 3:40 pm" */
export function dateTime(ms: number) {
  const d = new Date(ms);
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${clockTime(ms)}`;
}

/** "Outpatient invoice" → "outpatient invoice" mid-sentence, leaving acronyms ("MRI scan") alone. */
export function midSentence(text: string) {
  return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}
