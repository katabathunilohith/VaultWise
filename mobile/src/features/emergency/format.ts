import { money, moneyWhole } from "@/lib/money";
import type { Minor } from "@/lib/api/types";

const DAY = 86_400_000;

/** ₹1,500 for whole amounts, ₹1,500.50 otherwise — amounts people typed stay exact. */
export function fmt(amount: Minor, currency: string) {
  return amount % 100 === 0 ? moneyWhole(amount, currency) : money(amount, currency);
}

let timeFmt: Intl.DateTimeFormat | null = null;
let dayFmt: Intl.DateTimeFormat | null = null;
let weekdayFmt: Intl.DateTimeFormat | null = null;

/** "3:40 pm" — exact times beat ranges. */
export function clockTime(ms: number) {
  timeFmt ??= new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  return timeFmt.format(ms).replace(/\s?AM$/i, " am").replace(/\s?PM$/i, " pm");
}

/** "24 Oct" */
export function shortDate(ms: number) {
  dayFmt ??= new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
  return dayFmt.format(ms);
}

/** "Fri 24 Oct" */
export function dayDate(ms: number) {
  weekdayFmt ??= new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
  return weekdayFmt.format(ms).replace(",", "");
}

function sameDay(a: number, b: number) {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** "at 3:40 pm", "tomorrow at 3:40 pm" or "on Fri 24 Oct at 3:40 pm". */
export function whenText(ms: number, now = Date.now()) {
  if (sameDay(ms, now)) return `at ${clockTime(ms)}`;
  if (sameDay(ms, now + DAY)) return `tomorrow at ${clockTime(ms)}`;
  return `on ${dayDate(ms)} at ${clockTime(ms)}`;
}

/** "today", "tomorrow" or "Fri 24 Oct" — for due dates. */
export function dayWord(ms: number, now = Date.now()) {
  if (sameDay(ms, now)) return "today";
  if (sameDay(ms, now + DAY)) return "tomorrow";
  return dayDate(ms);
}

/** "Today", "Yesterday" or "24 Oct" for list rows. */
export function rowDate(ms: number, now = Date.now()) {
  if (sameDay(ms, now)) return "Today";
  if (sameDay(ms, now - DAY)) return "Yesterday";
  return shortDate(ms);
}
