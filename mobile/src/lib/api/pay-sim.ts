/**
 * Pay with Vaultwise, simulated on the device while the server's /pay routes don't exist (see
 * pay-types.ts). The same sample checkouts run in two places:
 * - Practice (practiceCheckouts): paid from the practice vaults through the simulator's ledger.
 * - A live session (payDryRun): checked against the customer's real vaults, and nothing moves.
 */
import { covers } from "../categories";
import { ApiError } from "./errors";
import type { PaymentIntent } from "./pay-types";
import { PRACTICE_PIN } from "./practice";
import type { Minor, Stage, StageStatus, Vault, VaultCategory } from "./types";

const DAY = 86_400_000;

type PayVault = PaymentIntent["eligibleVaults"][number];

interface SimIntent extends PaymentIntent {
  confirmedAt?: number;
  outcome?: "succeeded" | "in_review";
}

/** Where a Practice payment's money moves: the simulator's vaults and ledger. */
export interface PayLedger {
  vaults(): Vault[];
  /** Sets money aside while a person checks the payment. */
  hold(v: Vault, amount: Minor): void;
  release(v: Vault, amount: Minor): void;
  pay(v: Vault, amount: Minor, memo: string, payee: string): void;
}

/**
 * Rough price level per currency (USD = 1): the table the server sizes its own samples with
 * (src/lib/shared.ts), so a sample bill costs about the same in every wallet currency.
 */
const CURRENCY_SCALE: Record<string, number> = { USD: 1, EUR: 0.95, GBP: 0.8, SGD: 1.3, INR: 80, CAD: 1.35, AUD: 1.5, AED: 3.67 };

/** A sample bill's line items, written in USD and sized to `cur`; the total is their sum. */
function bill(cur: string, items: [string, number][]) {
  const scale = CURRENCY_SCALE[cur] ?? 1;
  const lineItems = items.map(([description, usd]) => ({ description, amount: Math.round(usd * scale * 100) }));
  return { currency: cur, lineItems, amount: lineItems.reduce((s, x) => s + x.amount, 0) };
}

/** A batch of sample checkouts in `cur`. Each batch after the first gets its own ids. */
function makeIntents(gen: number, cur: string): SimIntent[] {
  const now = Date.now();
  const suffix = gen ? `_${gen}` : "";
  const base = { createdAt: now, expiresAt: now + DAY, status: "requires_customer" as const, eligibleVaults: [], simulated: true };
  return [
    {
      ...base,
      ...bill(cur, [
        ["Cardiology consultation", 150],
        ["Electrocardiogram (ECG)", 85],
        ["Comprehensive blood panel", 62.5],
      ]),
      id: `pi_demo_citygeneral${suffix}`,
      merchant: { id: "mer_citygeneral", name: "City General Hospital", category: "health", city: "Outpatient billing" },
      category: "health",
      description: "Outpatient invoice",
      reference: "INV-20995",
      outcome: "succeeded",
    },
    {
      ...base,
      ...bill(cur, [
        ["Organic Chemistry, 9th ed.", 36.125],
        ["Lab notebook (2)", 4.5],
        ["Scientific calculator", 12.5],
      ]),
      id: `pi_demo_westfield${suffix}`,
      merchant: { id: "mer_westfield", name: "Westfield College Bookstore", category: "education", city: "Campus store" },
      category: "education",
      description: "Semester textbooks",
      reference: "WCB-7781",
      outcome: "succeeded",
    },
    {
      ...base,
      ...bill(cur, [
        ["Amoxicillin 500mg", 5.25],
        ["Blood pressure monitor cuff", 6.75],
        ["Energy drinks (6-pack)", 2.75],
      ]),
      id: `pi_demo_greenleaf${suffix}`,
      merchant: { id: "mer_greenleaf", name: "Greenleaf Pharmacy", category: "health", city: "High Street" },
      category: "health",
      description: "Pharmacy basket",
      reference: "GLP-30412",
      outcome: "in_review",
    },
  ];
}

/**
 * The sample checkouts. Handled ones are kept, so a paid (or in-review) checkout keeps its
 * outcome and still explains any money it set aside. A fresh batch with new ids is added only
 * once nothing is left to pay or being paid.
 */
function intentStore(initialCurrency: string) {
  let cur = initialCurrency;
  let gen = 0;
  let list = makeIntents(gen, cur);
  const reset = (nextCurrency = cur) => {
    cur = nextCurrency;
    gen = 0;
    list = makeIntents(gen, cur);
  };
  return {
    find: (intentId: string) => list.find((x) => x.id === intentId),
    list: () => list,
    refill() {
      const now = Date.now();
      const open = list.some((i) => i.status === "processing" || (i.status === "requires_customer" && i.expiresAt > now));
      if (!open) list = [...list, ...makeIntents(++gen, cur)];
    },
    reset,
    /** Sizes the samples for this wallet currency. A different currency starts them over. */
    sizeFor(walletCurrency: string) {
      if (walletCurrency !== cur) reset(walletCurrency);
    },
  };
}
type IntentStore = ReturnType<typeof intentStore>;

const PAY_STAGES: { key: string; name: string; ms: number; skipped?: boolean }[] = [
  { key: "intake", name: "Invoice from a registered merchant", ms: 250 },
  { key: "preprocess", name: "Image forensics", ms: 0, skipped: true },
  { key: "extract", name: "Read the merchant's line items", ms: 300 },
  { key: "classify", name: "Purpose matches the vault", ms: 450 },
  { key: "tamper", name: "Not paid before", ms: 300 },
  { key: "decision", name: "Decision & audit trail", ms: 250 },
];
const PAY_MS = PAY_STAGES.reduce((s, x) => s + x.ms, 0);
/** A person's check on a payment sent for review, sped up for Practice (as the Tier 2 pause is). */
const PAY_REVIEW_MS = 90_000;

/** The vaults that can pay a bill in this category, with what each has available now. */
function payVaults(vaults: Vault[], category: VaultCategory): PayVault[] {
  return vaults.filter((v) => covers(v, category)).map((v) => ({ id: v.id, name: v.name, category: v.category, available: v.available }));
}

function payFrom(ledger: PayLedger, v: Vault, i: SimIntent) {
  ledger.pay(v, i.amount, `Paid ${i.merchant.name} · ${i.reference}`, i.merchant.name);
}

/**
 * Moves a confirmed checkout to its outcome once the checks are done. Only Practice moves money
 * (through `ledger`); a dry run against live vaults (no ledger) changes nothing in them.
 *
 * In Practice a payment sent to a person is held, then the simulated person approves it after
 * PAY_REVIEW_MS: the hold becomes the payment, as with an approved withdrawal. So no hold is
 * left behind, however many rounds of samples are paid.
 */
function advanceIntent(i: SimIntent, ledger: PayLedger | null) {
  if (!i.confirmedAt) return;
  const now = Date.now();
  const v = ledger?.vaults().find((x) => x.id === i.vaultId);
  if (i.status === "processing" && now - i.confirmedAt >= PAY_MS) {
    i.status = i.outcome ?? "succeeded";
    if (ledger && v && i.status === "succeeded") payFrom(ledger, v, i);
    else if (ledger && v) ledger.hold(v, i.amount);
    if (i.status !== "in_review") i.decisionReason = null;
    else if (ledger) {
      // Rounded up to the minute, so the time shown is never earlier than the decision.
      const by = new Date(Math.ceil((i.confirmedAt + PAY_MS + PAY_REVIEW_MS) / 60_000) * 60_000);
      const time = by.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
      i.decisionReason = `One item doesn't look like a ${i.category} expense, so a person will check it by ${time}.`;
    } else {
      i.decisionReason = `One item doesn't look like a ${i.category} expense. In a real payment, a person would check it before anything is paid.`;
    }
  }
  if (ledger && i.status === "in_review" && now - i.confirmedAt >= PAY_MS + PAY_REVIEW_MS) {
    i.status = "succeeded";
    i.decisionReason = null;
    if (v) {
      ledger.release(v, i.amount);
      payFrom(ledger, v, i);
    }
  }
}

function payStages(i: SimIntent): Stage[] | undefined {
  if (!i.confirmedAt) return undefined;
  const elapsed = Date.now() - i.confirmedAt;
  let t = 0;
  return PAY_STAGES.map((s) => {
    const start = t;
    t += s.ms;
    let status: StageStatus = s.skipped ? "skipped" : elapsed >= t ? "passed" : elapsed >= start ? "running" : "pending";
    if (status === "passed" && s.key === "classify" && i.outcome === "in_review") status = "warning";
    return { key: s.key, name: s.name, status, checks: [] };
  });
}

function intentView(i: SimIntent, eligibleVaults: PayVault[], extra: Partial<PaymentIntent> = {}): PaymentIntent {
  const stages = payStages(i);
  return { ...i, eligibleVaults, ...(stages ? { stages } : {}), ...extra };
}

function findIntent(store: IntentStore, intentId: string) {
  const i = store.find(intentId);
  if (!i) throw new ApiError("This payment link has expired or doesn't exist", 404);
  return i;
}

/** A confirm's checks, in the server's order, then the checkout starts processing. */
function startPayment(i: SimIntent, pin: string, findVault: () => Vault | undefined) {
  // A checkout can be confirmed only while it's still waiting and its link hasn't run out.
  if (i.status !== "requires_customer") throw new ApiError("This payment has already been handled", 409);
  if (Date.now() >= i.expiresAt) throw new ApiError("This payment link has expired. Ask the merchant for a new one.", 409);
  if (pin !== PRACTICE_PIN) throw new ApiError("That PIN isn't right", 403);
  const v = findVault();
  if (!v || !covers(v, i.category)) throw new ApiError("This vault can't pay this bill. Pick another one.", 400);
  if (v.available < i.amount) throw new ApiError(`${v.name} doesn't have enough available`, 400);
  i.vaultId = v.id;
  i.status = "processing";
  i.confirmedAt = Date.now();
}

/**
 * Practice checkouts, paid from the simulator's vaults through `ledger`. Reads are views over the
 * vaults after any payment, so balances are post-payment.
 */
export function practiceCheckouts(ledger: PayLedger, initialCurrency: string) {
  const store = intentStore(initialCurrency);
  const view = (i: SimIntent) => {
    advanceIntent(i, ledger);
    return intentView(i, payVaults(ledger.vaults(), i.category));
  };
  return {
    /** The server would finish payments in the background; every read catches Practice up first. */
    settle() {
      for (const i of store.list()) advanceIntent(i, ledger);
    },
    view: (intentId: string) => view(findIntent(store, intentId)),
    confirm(intentId: string, vaultId: string, pin: string) {
      const i = findIntent(store, intentId);
      advanceIntent(i, ledger);
      startPayment(i, pin, () => {
        const v = ledger.vaults().find((x) => x.id === vaultId);
        if (!v) throw new ApiError("Vault not found", 404);
        return v;
      });
      return view(i);
    },
    /** Every sample checkout; a fresh batch once nothing is left to pay. Settle first. */
    list() {
      store.refill();
      return store.list().map(view);
    },
    reset: () => store.reset(),
  };
}

/** The live session's sample checkouts, made on first use in the wallet's currency. */
let dryRunStore: IntentStore | null = null;
function dryRunCheckouts(walletCurrency: string) {
  if (!dryRunStore) dryRunStore = intentStore(walletCurrency);
  else dryRunStore.sizeFor(walletCurrency);
  return dryRunStore;
}

/**
 * Pay with Vaultwise in a live session while the server's /pay routes don't exist. The sample
 * checkouts are offered against the customer's own vaults (the live client passes them in, with
 * the wallet currency, and the samples are sized to that currency) and checked against their real
 * balances, but nothing is debited or held. Every view is marked `dryRun` so the screens can say so.
 */
export const payDryRun = {
  view(intentId: string, vaults: Vault[], walletCurrency: string): PaymentIntent {
    const i = findIntent(dryRunCheckouts(walletCurrency), intentId);
    advanceIntent(i, null);
    return intentView(i, payVaults(vaults, i.category), { dryRun: true });
  },
  confirm(intentId: string, vaultId: string, pin: string, vaults: Vault[], walletCurrency: string): PaymentIntent {
    const i = findIntent(dryRunCheckouts(walletCurrency), intentId);
    advanceIntent(i, null);
    startPayment(i, pin, () => vaults.find((x) => x.id === vaultId));
    return intentView(i, payVaults(vaults, i.category), { dryRun: true });
  },
  list(vaults: Vault[], walletCurrency: string): PaymentIntent[] {
    const store = dryRunCheckouts(walletCurrency);
    for (const i of store.list()) advanceIntent(i, null);
    store.refill();
    return store.list().map((i) => intentView(i, payVaults(vaults, i.category), { dryRun: true }));
  },
  /** After the live account is wiped, its sample checkouts start over too. */
  reset: () => dryRunStore?.reset(),
};
