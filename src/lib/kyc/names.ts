/**
 * Compares the name printed on an ID with the account name, ignoring case, spacing, punctuation,
 * accents, honorifics and word order. Initials ("S. Aayan Javed") count as half a match.
 */

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "shri", "sri", "smt", "kumari", "km", "md", "mohd", "late"]);

export function nameTokens(name: string | null | undefined): string[] {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !HONORIFICS.has(t));
}

export type NameMatch = "match" | "partial" | "mismatch" | "unknown";

export function compareNames(onDocument: string | null | undefined, account: string | null | undefined): { result: NameMatch; score: number } {
  const a = nameTokens(onDocument);
  const b = nameTokens(account);
  if (!a.length || !b.length) return { result: "unknown", score: 0 };
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const pool = [...long];
  let score = 0;
  let full = 0;
  for (const t of short) {
    const exact = pool.indexOf(t);
    if (exact >= 0) {
      pool.splice(exact, 1);
      score += 1;
      full += 1;
      continue;
    }
    // An initial on either side matches a word starting with that letter.
    const initial = pool.findIndex((p) => (t.length === 1 && p.startsWith(t)) || (p.length === 1 && t.startsWith(p)));
    if (initial >= 0) {
      pool.splice(initial, 1);
      score += 0.5;
    }
  }
  const ratio = score / short.length;
  if (full >= 1 && ratio >= 0.75 && (short.length > 1 || long.length === 1)) return { result: "match", score: ratio };
  if (full >= 1 && ratio >= 0.4) return { result: "partial", score: ratio };
  return { result: "mismatch", score: ratio };
}
