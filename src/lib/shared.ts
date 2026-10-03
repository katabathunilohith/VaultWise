/** Code shared by server and client: categories, money formatting, labels. */

export const BRAND = {
  name: "Vaultwise",
  tagline: "Savings that keep their promise.",
};

export type VaultCategory = "health" | "education" | "housing" | "emergency" | "retirement" | "custom";

export const CATEGORIES: Record<VaultCategory, { label: string; color: string; colorDark: string; proofHint: string; examples: string[] }> = {
  health: {
    label: "Health / Medical",
    color: "#2a78d6",
    colorDark: "#3987e5",
    proofHint: "Medical invoice, pharmacy receipt, hospital bill or prescription",
    examples: ["hospital invoice", "pharmacy receipt", "lab report bill"],
  },
  education: {
    label: "Education",
    color: "#eb6834",
    colorDark: "#d95926",
    proofHint: "Tuition invoice, fee receipt, course enrolment or textbook receipt",
    examples: ["tuition invoice", "school fee receipt", "course enrolment"],
  },
  housing: {
    label: "Housing / Rent",
    color: "#1baf7a",
    colorDark: "#199e70",
    proofHint: "Rent agreement, rent receipt, deposit or mortgage statement",
    examples: ["rent receipt", "lease agreement", "deposit invoice"],
  },
  emergency: {
    label: "Emergency (general)",
    color: "#eda100",
    colorDark: "#c98500",
    proofHint: "Any bill supporting the emergency (repair, travel, utilities)",
    examples: ["repair invoice", "urgent travel booking", "utility bill"],
  },
  retirement: {
    label: "Retirement",
    color: "#e87ba4",
    colorDark: "#d55181",
    proofHint: "Retirement / pension contribution statement or age-eligibility proof",
    examples: ["pension statement", "annuity purchase"],
  },
  custom: {
    label: "Custom goal",
    color: "#008300",
    colorDark: "#008300",
    proofHint: "Receipt matching the verification template you chose",
    examples: ["wedding venue invoice", "car purchase invoice"],
  },
};

export const CATEGORY_ORDER: VaultCategory[] = ["health", "education", "housing", "emergency", "retirement", "custom"];

export const EMERGENCY_REASONS: Record<string, string> = {
  medical: "Medical emergency",
  accident: "Accident or injury",
  job_loss: "Sudden loss of income",
  urgent_travel: "Urgent family travel",
  home_repair: "Urgent home repair",
  bereavement: "Bereavement",
  other: "Other urgent need",
};

/** Rough price-level scale used for demo amounts in each currency. */
export const CURRENCY_SCALE: Record<string, number> = { USD: 1, EUR: 0.95, GBP: 0.8, SGD: 1.3, INR: 80 };

export const CURRENCY_LOCALE: Record<string, string> = {
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  INR: "en-IN",
  SGD: "en-SG",
};

export function fmtMoney(minor: number, currency = "USD", opts: { compact?: boolean; sign?: boolean; decimals?: boolean } = {}) {
  const value = minor / 100;
  const nf = new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? "en-US", {
    style: "currency",
    currency,
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : opts.decimals === false ? 0 : 2,
    minimumFractionDigits: opts.compact || opts.decimals === false ? 0 : 2,
    signDisplay: opts.sign ? "exceptZero" : "auto",
  });
  return nf.format(value);
}

export function fmtNumber(n: number, digits = 2) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function fmtPct(n: number, digits = 1, sign = false) {
  return `${sign && n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function toMinor(major: number | string) {
  const n = typeof major === "string" ? Number(major.replace(/,/g, "")) : major;
  return Math.round(n * 100);
}

export function timeAgo(ts: number, now = Date.now()) {
  const s = Math.round((now - ts) / 1000);
  if (s < 0) {
    const f = -s;
    if (f < 60) return `in ${f}s`;
    if (f < 3600) return `in ${Math.round(f / 60)}m`;
    if (f < 86400) return `in ${Math.round(f / 3600)}h`;
    return `in ${Math.round(f / 86400)}d`;
  }
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function fmtDate(ts: number | string, withTime = false) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}
