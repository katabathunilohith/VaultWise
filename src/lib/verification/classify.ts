import type { VaultCategory } from "../shared";

type Scored = Exclude<VaultCategory, "custom"> | "other";

/**
 * Deterministic, explainable keyword classifier. It runs alongside the vision
 * model's own category scores so a single model can't approve on its own, and
 * so the reviewer can see exactly which terms drove the score.
 */
const LEXICON: Record<Exclude<Scored, "other">, [string, number][]> = {
  health: [
    ["hospital", 3],
    ["clinic", 3],
    ["pharmacy", 3],
    ["medical", 3],
    ["patient", 3],
    ["prescription", 3],
    ["diagnos", 2],
    ["consultation", 2],
    ["physician", 2],
    ["doctor", 2],
    ["dr.", 1],
    ["lab", 1],
    ["blood", 2],
    ["ecg", 2],
    ["x-ray", 2],
    ["mri", 2],
    ["dental", 2],
    ["surgery", 3],
    ["outpatient", 3],
    ["inpatient", 3],
    ["medicine", 2],
    ["health", 2],
    ["therapy", 2],
    ["nursing", 2],
    ["optical", 1],
    ["vaccin", 2],
    ["ward", 1],
  ],
  education: [
    ["tuition", 3],
    ["school", 3],
    ["university", 3],
    ["college", 3],
    ["semester", 3],
    ["course", 2],
    ["enrol", 3],
    ["student", 3],
    ["academy", 2],
    ["exam", 2],
    ["textbook", 2],
    ["fee", 1],
    ["admission", 2],
    ["campus", 2],
    ["registrar", 2],
    ["scholar", 1],
    ["curriculum", 2],
    ["class", 1],
    ["education", 3],
  ],
  housing: [
    ["rent", 3],
    ["lease", 3],
    ["landlord", 3],
    ["tenant", 3],
    ["tenancy", 3],
    ["apartment", 2],
    ["deposit", 1],
    ["mortgage", 3],
    ["property", 2],
    ["housing", 3],
    ["flat", 1],
    ["premises", 2],
    ["maintenance charge", 2],
    ["security deposit", 3],
    ["unit no", 1],
  ],
  emergency: [
    ["repair", 2],
    ["emergency", 3],
    ["urgent", 2],
    ["plumb", 2],
    ["towing", 3],
    ["locksmith", 3],
    ["flight", 2],
    ["airline", 2],
    ["ticket", 1],
    ["utility", 2],
    ["electric", 1],
    ["funeral", 3],
    ["ambulance", 3],
    ["damage", 2],
  ],
  retirement: [
    ["pension", 3],
    ["retirement", 3],
    ["annuity", 3],
    ["401(k)", 3],
    ["ira", 2],
    ["provident fund", 3],
    ["superannuation", 3],
    ["nps", 2],
    ["contribution statement", 2],
  ],
};

export function keywordScores(text: string): Record<Scored, number> & { hits: Record<string, string[]> } {
  const t = ` ${text.toLowerCase()} `;
  const raw: Record<string, number> = {};
  const hits: Record<string, string[]> = {};
  for (const [cat, words] of Object.entries(LEXICON)) {
    raw[cat] = 0;
    hits[cat] = [];
    for (const [w, weight] of words) {
      if (t.includes(w)) {
        raw[cat] += weight;
        hits[cat].push(w);
      }
    }
  }
  const total = Object.values(raw).reduce((a, b) => a + b, 0);
  const out = { other: total === 0 ? 1 : 0, hits } as Record<Scored, number> & { hits: Record<string, string[]> };
  for (const cat of Object.keys(raw) as Exclude<Scored, "other">[]) {
    // Saturating evidence curve: ~6 points of evidence ≈ 0.9 confidence.
    const strength = 1 - Math.exp(-raw[cat] / 2.6);
    out[cat] = total === 0 ? 0 : strength * (raw[cat] / total);
  }
  return out;
}

/** Which document categories satisfy a vault's verification template. */
export function acceptedCategories(template: VaultCategory): Scored[] {
  switch (template) {
    case "emergency":
      return ["emergency", "health", "housing"];
    case "custom":
      return ["other"];
    default:
      return [template];
  }
}
