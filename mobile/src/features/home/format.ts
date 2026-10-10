/**
 * Date and name formatting for Home, Activity and Upcoming. Dates follow the device locale;
 * times read "3:40 pm" (DESIGN.md §5: exact times beat ranges).
 */

export const DAY_MS = 86_400_000;

export function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole calendar days from `now` to `t` (negative = past). */
export function dayDiff(t: number, now: number) {
  return Math.round((startOfDay(t) - startOfDay(now)) / DAY_MS);
}

/** Week number with weeks starting Monday — the same index the server's streak uses. */
export function weekIndex(t: number) {
  return Math.floor((t / DAY_MS + 3) / 7);
}

/** "2026-11" — used to remember a dismissed fresh-start card for the rest of the month. */
export function monthKey(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const dateCache = new Map<string, Intl.DateTimeFormat>();
function df(opts: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(opts);
  let f = dateCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, opts);
    dateCache.set(key, f);
  }
  return f;
}

/** "3:40 pm" */
export function timeLabel(t: number) {
  return df({ hour: "numeric", minute: "2-digit" })
    .format(t)
    .replace(/\s?AM$/i, " am")
    .replace(/\s?PM$/i, " pm");
}

/** "6 Oct" (adds the year when it isn't this year). */
export function shortDate(t: number, now: number) {
  const sameYear = new Date(t).getFullYear() === new Date(now).getFullYear();
  return df(sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }).format(t);
}

/** "Sat 11 Oct" */
export function dayChip(t: number) {
  return df({ weekday: "short", day: "numeric", month: "short" }).format(t);
}

/** Parts for a calendar tile: "Sat", "11", "Oct". */
export function dateParts(t: number) {
  return {
    weekday: df({ weekday: "short" }).format(t),
    day: df({ day: "numeric" }).format(t),
    month: df({ month: "short" }).format(t),
  };
}

/** Past events in a feed: "Just now", "12 min ago", "Today, 3:40 pm", "Yesterday", "Monday", "6 Oct". */
export function relativeWhen(t: number, now: number) {
  const mins = Math.floor((now - t) / 60_000);
  if (mins >= 0 && mins < 1) return "Just now";
  if (mins >= 1 && mins < 60) return `${mins} min ago`;
  const days = dayDiff(t, now);
  if (days === 0) return `Today, ${timeLabel(t)}`;
  if (days === -1) return "Yesterday";
  if (days > -7 && days < 0) return df({ weekday: "long" }).format(t);
  return shortDate(t, now);
}

/** Future events: "Today, 11:30 pm", "Tomorrow, 9:00 am", "Sat 11 Oct". */
export function whenAhead(t: number, now: number) {
  const days = dayDiff(t, now);
  if (days === 0) return `Today, ${timeLabel(t)}`;
  if (days === 1) return `Tomorrow, ${timeLabel(t)}`;
  return dayChip(t);
}

/** Section titles in a day-grouped list: "Today", "Yesterday", "Monday 6 October". */
export function sectionDay(t: number, now: number) {
  const days = dayDiff(t, now);
  if (days === 0) return "Today";
  if (days === -1) return "Yesterday";
  const sameYear = new Date(t).getFullYear() === new Date(now).getFullYear();
  return df(sameYear ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(t);
}

/** "Alex Morgan" → "AM"; one name → its first two letters. */
export function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Some stored memos arrive with UTF-8 read as Latin-1 ("Card Â· Metro"). Drops the stray "Â"
 * in front of Latin-1 punctuation so the text reads as written.
 */
export function cleanText(s: string) {
  return s.replace(/Â(?=[ -¿])/g, "");
}
