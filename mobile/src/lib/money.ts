import type { Minor } from "./api/types";

/** Locale per wallet currency, used when the API's rulebook locale isn't loaded yet. */
const LOCALE: Record<string, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "en-IE",
  GBP: "en-GB",
  SGD: "en-SG",
  CAD: "en-CA",
  AUD: "en-AU",
  AED: "en-AE",
};

let activeLocale: string | null = null;

/** Called once the customer's rulebook is known (rules.locale). */
export function setMoneyLocale(locale: string | null) {
  activeLocale = locale;
}

function localeFor(currency: string) {
  return activeLocale ?? LOCALE[currency] ?? "en-US";
}

const cache = new Map<string, Intl.NumberFormat>();
function nf(currency: string, opts: Intl.NumberFormatOptions) {
  const key = `${localeFor(currency)}|${currency}|${JSON.stringify(opts)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(localeFor(currency), { style: "currency", currency, ...opts });
    cache.set(key, f);
  }
  return f;
}

/** ₹1,60,288.00 — full precision. */
export function money(amount: Minor, currency: string) {
  return nf(currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount / 100);
}

/** ₹1,60,288 — whole units, for big headline numbers and list rows. */
export function moneyWhole(amount: Minor, currency: string) {
  return nf(currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(amount / 100));
}

/** ₹1.6L / $16.2K — compact, for tight spaces. Falls back to a manual format if Intl lacks compact notation. */
export function moneyCompact(amount: Minor, currency: string) {
  const major = amount / 100;
  try {
    return nf(currency, { notation: "compact", maximumFractionDigits: 1 }).format(major);
  } catch {
    const abs = Math.abs(major);
    const sym = moneyWhole(0, currency).replace(/[\d\s.,]/g, "");
    const [div, suffix] = abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : abs >= 1e3 ? [1e3, "K"] : [1, ""];
    return `${major < 0 ? "−" : ""}${sym}${(abs / div).toFixed(div === 1 ? 0 : 1)}${suffix}`;
  }
}

/** Splits a formatted amount so the UI can style the symbol, whole part and decimals separately. */
export function moneyParts(amount: Minor, currency: string) {
  const parts = nf(currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(amount / 100);
  let symbol = "";
  let whole = "";
  let fraction = "";
  let sign = "";
  for (const p of parts) {
    if (p.type === "currency") symbol = p.value;
    else if (p.type === "minusSign") sign = "−";
    else if (p.type === "integer" || p.type === "group") whole += p.value;
    else if (p.type === "fraction") fraction = p.value;
  }
  return { sign, symbol, whole, fraction };
}

/** The currency symbol on its own, e.g. "₹". */
export function currencySymbol(currency: string) {
  return moneyParts(0, currency).symbol || currency;
}

/** Parses what someone typed on the amount keypad ("1,250.5") into minor units. */
export function parseAmount(text: string): Minor | null {
  const clean = text.replace(/[^\d.]/g, "");
  if (!clean || clean === ".") return null;
  const n = Number(clean);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
