/**
 * Joins parts into one screen-reader label ("Title. Subtitle"). Empty parts are skipped, and a
 * part that already ends in punctuation isn't given a second full stop.
 */
export function spoken(...parts: (string | null | undefined | false)[]) {
  return parts.reduce<string>((acc, p) => {
    const t = typeof p === "string" ? p.trim() : "";
    if (!t) return acc;
    if (!acc) return t;
    return /[.?!…:]$/.test(acc) ? `${acc} ${t}` : `${acc}. ${t}`;
  }, "");
}
