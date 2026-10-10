const DAY = 24 * 60 * 60 * 1000;

let timeFormat: Intl.DateTimeFormat | null = null;
let weekdayFormat: Intl.DateTimeFormat | null = null;

function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function timeOfDay(d: Date) {
  try {
    timeFormat ??= new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
    // "3:40 PM" / "3:40 p.m." → "3:40 pm"; 24-hour locales are left as they are.
    return timeFormat.format(d).replace(/\s?([AaPp])\.?\s?[Mm]\.?/, (_m, p: string) => ` ${p.toLowerCase()}m`);
  } catch {
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
}

/**
 * An exact clock time, the way the copy rules ask for it: "3:40 pm", "9:05 am tomorrow",
 * "10:15 am on Tuesday".
 */
export function clockTime(ms: number, now: number = Date.now()) {
  const d = new Date(ms);
  const base = timeOfDay(d);
  const days = Math.round((startOfDay(ms) - startOfDay(now)) / DAY);
  if (days === 0) return base;
  if (days === 1) return `${base} tomorrow`;
  if (days === -1) return `${base} yesterday`;
  try {
    weekdayFormat ??= new Intl.DateTimeFormat(undefined, { weekday: "long" });
    return `${base} on ${weekdayFormat.format(d)}`;
  } catch {
    return base;
  }
}

/** 1st, 2nd, 3rd, 4th … */
export function ordinal(n: number) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}
