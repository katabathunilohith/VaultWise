/**
 * Time and date wording for the proof area. Exact times beat ranges ("by 3:40 pm"), so every
 * status line names a clock time, and a day only when it isn't today.
 */

const DAY = 86_400_000;

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
const timeSecFmt = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const dayYearFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Intl may use narrow no-break spaces and upper-case AM/PM depending on the engine. */
const tidy = (s: string) => s.replace(/[  ]/g, " ").toLowerCase();

function startOfDay(ms: number) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "3:40 pm" (or "3:40:12 pm" with seconds). */
export function clockTime(ms: number, seconds = false) {
  return tidy((seconds ? timeSecFmt : timeFmt).format(ms));
}

/** "today", "tomorrow", "yesterday", "12 Oct", or "12 Oct 2025" in another year. */
export function dayLabel(ms: number, now = Date.now()) {
  const diff = Math.round((startOfDay(ms) - startOfDay(now)) / DAY);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return new Date(ms).getFullYear() === new Date(now).getFullYear() ? dayFmt.format(ms) : dayYearFmt.format(ms);
}

/** "3:40 pm" today, "3:40 pm tomorrow", "3:40 pm, 12 Oct". */
export function whenText(ms: number, now = Date.now(), seconds = false) {
  const t = clockTime(ms, seconds);
  const d = dayLabel(ms, now);
  if (d === "today") return t;
  if (d === "tomorrow" || d === "yesterday") return `${t} ${d}`;
  return `${t}, ${d}`;
}

/** "24 Aug 2026". */
export function dateText(ms: number) {
  return dayYearFmt.format(ms);
}

/** A document date from the reader ("2026-08-24" or any parseable date), as "24 Aug 2026". */
export function documentDate(raw: string | null | undefined) {
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const ms = iso ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime() : Date.parse(raw);
  return Number.isFinite(ms) ? dateText(ms) : null;
}

/** "1:05" — minutes and seconds left. */
export function countdown(msLeft: number) {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Lower-cases the first letter so a list item can sit inside a sentence. */
export function lowerFirst(s: string) {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

/** "a, b and c". */
export function listJoin(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
