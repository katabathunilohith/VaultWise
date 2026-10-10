/**
 * Response shapes of the Vaultwise REST API (`/api/v1`), taken from the live server.
 * Money in responses is always integer minor units (paise, cents). Request bodies take
 * major units; `client.ts` converts so screens only ever deal with minor units.
 */

export type Minor = number;
export type Millis = number;

export type VaultCategory = "health" | "education" | "housing" | "emergency" | "retirement" | "custom";

export interface Country {
  code: string;
  name: string;
  market: string;
  flag: string;
  currency: string;
  marketName: string;
}

export interface RiskProfile {
  answers: Record<string, number>;
  score: number;
  band: number;
  bandName: string;
  experience: number;
  completedAt: Millis;
}

export interface Rules {
  code: string;
  name: string;
  currency: string;
  locale: string;
  flag: string;
  dataRegime: string;
  emoneyRegime: string;
  investRegime: string;
  cryptoRegime: string;
  emergency: {
    monthlyCap: Minor;
    maxRequestsPer7d: number;
    cooloffAfterRequestsIn72h: number;
    cooloffHours: number;
    tier2HoldSeconds: number;
    receiptWindowDays: number;
  };
  limits: Record<string, unknown>;
  verification: { autoApprove: number; autoDeny: number; maxDocAgeDays: number; reviewSlaHours: number };
  satellite: { enabled: boolean; maxAllocationPct: number; assetClasses: string[]; minRiskBand: number };
  coolingOffDays: number;
  disclosures: string[];
}

export interface MeOnboarded {
  onboarded: true;
  aiEnabled: boolean;
  user: {
    id: string;
    name: string;
    email: string | null;
    jurisdiction: string;
    country: Country | null;
    currency: string;
    kycStatus: string;
    kycLevel: number;
    plan: string;
    riskProfile: RiskProfile | null;
    satelliteOptIn: boolean;
    createdAt: Millis;
  };
  rules: Rules;
  jurisdictions: { code: string; name: string; currency: string; flag: string }[];
  countries: Country[];
}

export interface MeNew {
  onboarded: false;
  aiEnabled: boolean;
  jurisdictions: { code: string; name: string; currency: string; flag: string }[];
  countries: Country[];
}

export type Me = MeOnboarded | MeNew;

export interface ContributionRule {
  type: "none" | "fixed" | "percent_income" | "roundup";
  amount: Minor | null;
  percent: number | null;
  frequency: "weekly" | "biweekly" | "monthly" | null;
  nextRunAt: Millis | null;
}

export interface VaultMember {
  id: string;
  name: string;
  role: string;
  contributed: Minor;
}

export interface Vault {
  id: string;
  name: string;
  category: VaultCategory;
  template: VaultCategory;
  target: Minor;
  targetDate: string | null;
  balance: Minor;
  held: Minor;
  available: Minor;
  progress: number;
  monthlyNeeded: Minor | null;
  rule: ContributionRule;
  isJoint: boolean;
  members: VaultMember[];
  status: string;
  createdAt: Millis;
  lastContributionAt: Millis | null;
  currency: string;
}

export interface Badge {
  key: string;
  label: string;
  detail: string;
  earned: boolean;
}

export interface Streak {
  streak: number;
  best: number;
  last12: { week: number; active: boolean }[];
}

export interface Dashboard {
  currency: string;
  totals: { saved: Minor; bank: Minor; invested: Minor; netWorth: Minor; corePnl: Minor };
  vaults: Vault[];
  series: ({ t: Millis } & Partial<Record<VaultCategory, Minor>>)[];
  emergency: { tier1Available: Minor; tier2Available: Minor; remainingCap: Minor; cap: Minor; receiptsDue: number };
  nudges: { kind?: string; title?: string; body?: string; [k: string]: unknown }[];
  streak: Streak;
  badges: Badge[];
  roundups: { s: Minor; n: number };
  recent: { id: string; kind: string; memo: string; created_at: Millis; amount: Minor }[];
  reviewPending: number;
}

export interface JournalLine {
  journal_id: string;
  kind: string;
  memo: string;
  created_at: Millis;
  amount: Minor;
  currency: string;
  ref_type: string | null;
  ref_id: string | null;
}

/** Server statuses: verifying = the automatic check is running; appealed = a person is re-checking. */
export type WithdrawalStatus = "awaiting_proof" | "processing" | "verifying" | "in_review" | "appealed" | "paid" | "denied" | "cancelled" | "expired" | string;

export interface WithdrawalRow {
  id: string;
  vault_id: string;
  amount: Minor;
  payee: string | null;
  note: string | null;
  status: WithdrawalStatus;
  proof_id: string | null;
  decision_reason: string | null;
  created_at: Millis;
  decided_at: Millis | null;
  decision: string | null;
  final_decision: string | null;
  confidence: number | null;
}

export interface VaultDetail {
  vault: Vault;
  history: JournalLine[];
  series: { t: Millis; balance: Minor }[];
  withdrawals: WithdrawalRow[];
  currency: string;
  userName: string;
}

export interface Guardrail {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail" | string;
  detail: string;
}

export interface EmergencyPlanItem {
  vaultId: string;
  vaultName: string;
  category: VaultCategory;
  amount: Minor;
  tier: 1 | 2;
  settled: boolean;
}

export interface EmergencyHistoryItem {
  id: string;
  amount: Minor;
  reasonCode: string;
  reason: string;
  note: string | null;
  tier: number;
  plan: EmergencyPlanItem[];
  guardrails: Guardrail[];
  riskScore: number;
  status: string;
  releaseAt: Millis;
  releasedAt: Millis | null;
  receiptStatus: string;
  receiptDueAt: Millis | null;
  receiptProofId: string | null;
  createdAt: Millis;
}

export interface EmergencyOverview {
  rules: Rules["emergency"];
  cap: Minor;
  marketCap: Minor;
  usedThisMonth: Minor;
  remainingCap: Minor;
  requestsLast7d: number;
  requestsLast72h: number;
  requestsLast30d: number;
  friction: { level: number; label: string; detail: string };
  tier1Available: Minor;
  tier2Available: Minor;
  healthVaults: { id: string; name: string; category: VaultCategory; available: Minor }[];
  tier2Vaults: { id: string; name: string; category: VaultCategory; available: Minor }[];
  history: EmergencyHistoryItem[];
  currency: string;
  hasPin: boolean;
}

export interface EmergencyPreview {
  amount: Minor;
  items: EmergencyPlanItem[];
  tier1: Minor;
  tier2: Minor;
  shortfall: Minor;
  needsPin: boolean;
  needsNote: boolean;
  coolingOff: boolean;
  releaseEstimate: string;
  checks: Guardrail[];
  blocked: boolean;
  risk: { score: number; features: { name: string; value: number; points: number }[] };
}

export interface EmergencyResult {
  id: string;
  status: "released" | "processing" | "cooling_off" | "blocked";
  plan: EmergencyPlanItem[] | EmergencyPreview;
  releaseAt?: Millis;
  receiptRequired?: boolean;
}

export type StageStatus = "pending" | "running" | "passed" | "warning" | "failed" | "skipped";

export interface Stage {
  key: string;
  name: string;
  status: StageStatus;
  score?: number;
  startedAt?: Millis;
  finishedAt?: Millis;
  summary?: string;
  checks: { label: string; status: "pass" | "warn" | "fail" | "info"; detail: string }[];
}

export interface ProofView {
  id: string;
  purpose: "withdrawal" | "emergency_receipt";
  category: string;
  fileName: string | null;
  createdAt: Millis;
  hasEla: boolean;
  extracted: {
    issuer?: string | null;
    recipient_name?: string | null;
    document_date?: string | null;
    total_amount?: number | null;
    currency?: string | null;
    summary?: string;
    [k: string]: unknown;
  } | null;
  vault: { id: string; name: string; category: string } | null;
  withdrawal: { id: string; amount: Minor; payee: string | null; status: WithdrawalStatus } | null;
  emergencyId: string | null;
  verification: {
    status: "queued" | "running" | "complete" | string;
    stages: Stage[];
    confidence: number | null;
    decision: string | null;
    finalDecision: "approved" | "denied" | null | string;
    reasons: string[];
    modelVersion: string | null;
    reviewer: string | null;
    reviewerNote: string | null;
    appealNote: string | null;
    queuedAt: Millis | null;
    decidedAt: Millis | null;
    durationMs: number | null;
  };
}

export type LimitKey = "singleWithdrawal" | "dailyWithdrawal" | "monthlyEmergency";

export interface LimitsOverview {
  currency: string;
  limits: Record<LimitKey, Minor>;
  bounds: Record<LimitKey, { min: Minor; default: Minor; max: Minor }>;
  usage: { withdrawnToday: Minor; dailyRemaining: Minor };
  quota: { perMonth: number; used: number; available: boolean; lastUsedAt: Millis | null; nextAvailableAt: Millis; resetsAt: Millis };
  emergency: { perMonth: number; used: number; increaseDays: number; maxIncreaseRatio: number };
  active: unknown[];
  history: unknown[];
}

export interface Holding {
  symbol: string;
  name: string;
  label: string;
  targetWeight: number;
  units: number;
  cost: Minor;
  price: number;
  dayChange: number;
  value: Minor;
  pnl: Minor;
  weight: number;
}

export interface Portfolio {
  currency: string;
  profile: RiskProfile | null;
  core: { value: Minor; cash: Minor; cost: Minor; pnl: Minor; holdings: Holding[] };
  satellite: { optedIn: boolean; allocated: Minor; realized: Minor; equity: Minor; mode: "paper" | string };
  total: Minor;
  split: { core: number; satellite: number };
}

export interface InvestCore {
  profile: RiskProfile | null;
  band: { band: number; name: string; min: number; expReturn: number; vol: number } | null;
  allocations: { slot: string; label: string; symbol: string; name: string; weight: number }[];
  quotes: { symbol: string; price: number; change: number; currency: string }[];
  holdings: { holdings: Holding[]; total: Minor; cost: Minor; pnl: Minor; cash: Minor };
  sips: { id: string; amount: Minor; frequency: string; next_run_at: Millis; active: number }[];
  orders: { id: string; symbol: string; side: string; units: number; price: number; amount: Minor; status: string; source: string; created_at: Millis }[];
  currency: string;
}

export interface Insight {
  headline: string;
  body: string;
  tip: string;
  source: "ai" | "rules" | string;
}

export interface AuditEvent {
  id: number;
  ts: Millis;
  actor: string;
  actor_type: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
}

export interface Activity {
  audit: AuditEvent[];
  journals: { id: string; kind: string; memo: string; created_at: Millis; entries: { account: string; kind: string; amount: Minor }[] }[];
  currency: string;
}

export interface Accounts {
  accounts: { id: string; institution: string; name: string; kind: string; mask: string; balance: Minor; is_primary: number }[];
  transactions: {
    id: string;
    merchant: string;
    category: string;
    amount: Minor;
    direction: "debit" | "credit";
    roundup: Minor | null;
    roundup_status: string | null;
    created_at: Millis;
  }[];
  roundups: { s: Minor; n: number };
  roundupVault: { id: string; name: string } | null;
  spendByCategory: { category: string; total: Minor }[];
  currency: string;
}

export interface BadgesResponse {
  streak: Streak;
  badges: Badge[];
  earned: number;
}

export interface Sample {
  key: string;
  label: string;
  category: string;
  expect: string;
}

/** Inputs in major units, as the API expects them. */
export interface CreateVaultInput {
  name: string;
  category: VaultCategory;
  template?: VaultCategory;
  target: number;
  targetDate?: string | null;
  ruleType?: ContributionRule["type"];
  ruleAmount?: number;
  rulePercent?: number;
  ruleFrequency?: "weekly" | "biweekly" | "monthly";
  initialDeposit?: number;
  isJoint?: boolean;
  members?: { name: string; email?: string }[];
}

export interface EmergencyInput {
  amount: number;
  reasonCode: string;
  note?: string;
  attest: boolean;
  pin?: string;
}

export interface OnboardingInput {
  name: string;
  email?: string;
  country: string;
  pin: string;
  demo: boolean;
}

export interface UpdateVaultInput {
  name?: string;
  target?: number;
  targetDate?: string | null;
  ruleType?: ContributionRule["type"];
  ruleAmount?: number;
  rulePercent?: number;
  ruleFrequency?: "weekly" | "biweekly" | "monthly";
}

export const EMERGENCY_REASONS: Record<string, string> = {
  medical: "Medical emergency",
  accident: "Accident or injury",
  job_loss: "Sudden loss of income",
  urgent_travel: "Urgent family travel",
  home_repair: "Urgent home repair",
  bereavement: "Bereavement",
  other: "Other urgent need",
};

/** A picked or captured image ready for multipart upload. */
export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}
