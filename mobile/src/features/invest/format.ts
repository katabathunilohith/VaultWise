import { money, moneyWhole } from "@/lib/money";
import type { Minor } from "@/lib/api/types";
import type { PlanFrequency } from "@/lib/invest";

export type Frequency = PlanFrequency;

/** Whole amounts without decimals (₹24,000), otherwise full precision (₹24,000.50). */
export function fmtMoney(amount: Minor, currency: string) {
  return amount % 100 === 0 ? moneyWhole(amount, currency) : money(amount, currency);
}

/** Absolute amount, with a real minus sign for losses handled by the caller. */
export function fmtAbs(amount: Minor, currency: string) {
  return money(Math.abs(amount), currency);
}

/** "3.7%" — one decimal under 10%, whole numbers above. */
export function fmtPct(fraction: number) {
  const p = Math.abs(fraction * 100);
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

/** Whole percent for weights ("55%"). */
export function fmtWeight(fraction: number) {
  return `${Math.round(fraction * 100)}%`;
}

/** Fractional fund units: two decimals, four when under one unit. */
export function fmtUnits(units: number) {
  const digits = Math.abs(units) < 1 ? 4 : 2;
  const n = new Intl.NumberFormat(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(units);
  return `${n} ${units === 1 ? "unit" : "units"}`;
}

/** Instrument prices in the market's own currency (no symbol: AAPL is in dollars, the wallet may not be). */
export function fmtPrice(price: number) {
  const digits = Math.abs(price) >= 1000 ? 0 : 2;
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(price);
}

/** "Tue, 12 Nov" (adds the year when it isn't this year). */
export function fmtDay(ms: number) {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

export function asFrequency(f: string | null | undefined): Frequency {
  return f === "weekly" ? "weekly" : "monthly";
}

export function everyWord(f: Frequency) {
  return f === "weekly" ? "every week" : "every month";
}

/** Shows what's been typed on the keypad as money, keeping a trailing "." or typed decimals. */
export function fmtTyped(text: string, currency: string) {
  const [whole = "", dec] = text.split(".");
  const base = moneyWhole(Number(whole || "0") * 100, currency);
  return dec === undefined ? base : `${base}.${dec}`;
}
