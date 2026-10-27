/**
 * The customer's "day" for daily limits: midnight in their country's main time zone, not the server's.
 * Countries with one zone use it; the US, Canada and Australia use their most populous zone. Unknown → UTC.
 */

const BY_COUNTRY: Record<string, string> = {
  US: "America/New_York",
  GB: "Europe/London",
  IN: "Asia/Kolkata",
  SG: "Asia/Singapore",
  CA: "America/Toronto",
  AU: "Australia/Sydney",
  AE: "Asia/Dubai",
  AT: "Europe/Vienna",
  BE: "Europe/Brussels",
  BG: "Europe/Sofia",
  HR: "Europe/Zagreb",
  CY: "Asia/Nicosia",
  EE: "Europe/Tallinn",
  FI: "Europe/Helsinki",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  GR: "Europe/Athens",
  IE: "Europe/Dublin",
  IT: "Europe/Rome",
  LV: "Europe/Riga",
  LT: "Europe/Vilnius",
  LU: "Europe/Luxembourg",
  MT: "Europe/Malta",
  NL: "Europe/Amsterdam",
  PT: "Europe/Lisbon",
  SK: "Europe/Bratislava",
  SI: "Europe/Ljubljana",
  ES: "Europe/Madrid",
};

/** Market (rule-set) fallbacks for users saved before countries existed. */
const BY_MARKET: Record<string, string> = {
  US: "America/New_York",
  UK: "Europe/London",
  EU: "Europe/Berlin",
  IN: "Asia/Kolkata",
  SG: "Asia/Singapore",
  CA: "America/Toronto",
  AU: "Australia/Sydney",
  AE: "Asia/Dubai",
};

export function timeZoneFor(user: { country?: string | null; jurisdiction?: string | null }): string {
  return (user.country && BY_COUNTRY[user.country]) || (user.jurisdiction && BY_MARKET[user.jurisdiction]) || "UTC";
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(ts: number, tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute), s: Number(p.second) };
}

/** Milliseconds the zone is ahead of UTC at `ts`. */
function offset(ts: number, tz: string) {
  const p = partsIn(ts, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ts / 1000) * 1000;
}

/** The UTC instant of local midnight for a calendar date in `tz` (DST-safe). */
function midnight(y: number, m: number, d: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offset(guess, tz);
  t = guess - offset(t, tz);
  return t;
}

/** Midnight in `tz` at the start of the day containing `ts`. */
export function zonedDayStart(ts: number, tz: string) {
  const p = partsIn(ts, tz);
  return midnight(p.y, p.m, p.d, tz);
}

/** Midnight in `tz` at the start of the next day. */
export function zonedNextDayStart(ts: number, tz: string) {
  const p = partsIn(ts, tz);
  const next = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
  return midnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), tz);
}
