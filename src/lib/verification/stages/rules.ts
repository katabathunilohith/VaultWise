import { CATEGORIES, fmtMoney, type VaultCategory } from "../../shared";
import { acceptedCategories, keywordScores } from "../classify";
import type { Check, Extraction } from "../types";
import { clamp, type Flag, type HardFail, type PipelineContext } from "./context";

export type Arithmetic = "ok" | "minor" | "mismatch" | "unknown";
export interface RuleScores {
  matchScore: number;
  amountScore: number;
  dateScore: number;
  nameScore: number;
  arithmetic: Arithmetic;
}
/** The scores used when nothing read the bill. */
export const UNREAD_SCORES: RuleScores = { matchScore: 0.5, amountScore: 0.5, dateScore: 0.5, nameScore: 0.7, arithmetic: "unknown" };

export interface RulesInput {
  template: VaultCategory;
  vaultName: string;
  /** Amount asked for, in minor units. */
  requested: number | null;
  userName: string;
  currency: string;
  maxDocAgeDays: number;
  now: number;
}

export interface RulesSink {
  checks: Check[];
  hardFails: HardFail[];
  flags: Flag[];
}

/**
 * The business rules on what was read: purpose, amount covered, totals add up, document date, name and currency.
 * No I/O. Checks, hard fails and flags are appended to `sink` as they arise (the stage passes its own lists, so a
 * malformed reading that throws midway leaves the same partial checks as before); tests can omit it.
 */
export function evaluateRules(
  x: Extraction,
  input: RulesInput,
  sink: RulesSink = { checks: [], hardFails: [], flags: [] },
): RulesSink & { scores: RuleScores } {
  const { template, vaultName, requested, currency } = input;
  const { checks, hardFails, flags } = sink;
  let amountScore = 0.5;
  let dateScore = 0.5;
  let nameScore = 0.7;
  let arithmetic: Arithmetic = "unknown";

  const kw = keywordScores(`${x.document_type} ${x.issuer ?? ""} ${x.text ?? ""} ${x.line_items.map((l) => l.description).join(" ")}`);
  const accepted = acceptedCategories(template);
  const llm = template === "custom" ? x.purpose_match : Math.max(...accepted.map((c) => clamp(Number(x.category_scores[c] ?? 0))));
  const kwScore = template === "custom" ? x.purpose_match : Math.max(...accepted.map((c) => kw[c] ?? 0));
  const matchScore = template === "custom" ? x.purpose_match : 0.6 * llm + 0.25 * kwScore + 0.15 * x.purpose_match;
  const kwHits = accepted.flatMap((c) => kw.hits[c] ?? []);
  checks.push({
    label: `Matches ${CATEGORIES[template].label}`,
    status: matchScore >= 0.7 ? "pass" : matchScore >= 0.4 ? "warn" : "fail",
    detail:
      template === "custom"
        ? `Purpose fit for "${vaultName}": ${(x.purpose_match * 100).toFixed(0)}% (custom vault — strictest tier)`
        : `Model ${(llm * 100).toFixed(0)}% · keywords ${(kwScore * 100).toFixed(0)}%${kwHits.length ? ` (${kwHits.slice(0, 5).join(", ")})` : ""}`,
  });
  if (matchScore < 0.2 && x.is_document) hardFails.push({ reason: `The document doesn't match the ${CATEGORIES[template].label} purpose`, forensic: false });

  if (requested != null && x.total_amount != null) {
    const docMinor = Math.round(x.total_amount * 100);
    if (docMinor >= requested * 0.98) {
      amountScore = 1;
      checks.push({
        label: "Amount covered",
        status: "pass",
        detail: `Document total ${fmtMoney(docMinor, currency)} ≥ requested ${fmtMoney(requested, currency)}`,
      });
    } else {
      amountScore = clamp(docMinor / requested) * 0.6;
      checks.push({
        label: "Amount covered",
        status: "fail",
        detail: `Document total ${fmtMoney(docMinor, currency)} is less than requested ${fmtMoney(requested, currency)}`,
      });
    }
  } else {
    checks.push({ label: "Amount covered", status: "warn", detail: "No total could be read from the document" });
  }

  // Do the itemised charges add up to the stated total?
  const items = x.line_items.map((l) => l.amount).filter((a): a is number => a != null && a > 0);
  if (x.total_amount != null && items.length >= 2) {
    const itemSum = items.reduce((a, b) => a + b, 0);
    const candidates = [itemSum, itemSum + (x.tax ?? 0), (x.subtotal ?? itemSum) + (x.tax ?? 0)];
    const gap = Math.min(...candidates.map((c) => Math.abs(c - x.total_amount!))) / Math.max(1, x.total_amount);
    arithmetic = gap <= 0.02 ? "ok" : gap <= 0.25 ? "minor" : "mismatch";
    checks.push({
      label: "Totals add up",
      status: arithmetic === "ok" ? "pass" : arithmetic === "minor" ? "warn" : "fail",
      detail:
        arithmetic === "ok" ? `Line items reconcile to the total` : `Line items sum to ${itemSum.toFixed(2)} but the total reads ${x.total_amount.toFixed(2)}`,
    });
    if (arithmetic === "mismatch") flags.push({ severity: "high", text: "Document total doesn't match its own line items" });
  }

  if (x.document_date) {
    const ageDays = (input.now - new Date(x.document_date).getTime()) / 86_400_000;
    if (ageDays < -2) {
      dateScore = 0;
      checks.push({ label: "Document date", status: "fail", detail: `Dated in the future (${x.document_date})` });
      hardFails.push({ reason: "The document is dated in the future", forensic: false });
    } else if (ageDays > input.maxDocAgeDays) {
      dateScore = 0.2;
      checks.push({ label: "Document date", status: "fail", detail: `${Math.round(ageDays)} days old (policy: ${input.maxDocAgeDays})` });
    } else {
      dateScore = 1;
      checks.push({ label: "Document date", status: "pass", detail: `${x.document_date} · within ${input.maxDocAgeDays}-day window` });
    }
  } else {
    checks.push({ label: "Document date", status: "warn", detail: "No date found" });
  }

  if (x.recipient_name) {
    const parts = input.userName
      .toLowerCase()
      .split(/\s+/)
      .filter((p) => p.length > 1);
    const onDoc = x.recipient_name.toLowerCase();
    const first = parts.length > 0 && onDoc.includes(parts[0]);
    const family = parts.length > 1 && onDoc.includes(parts.at(-1)!);
    nameScore = first ? 1 : family ? 0.6 : 0.35;
    checks.push({
      label: "Name on document",
      status: first ? "pass" : "warn",
      detail: first
        ? `"${x.recipient_name}" matches the account holder`
        : family
          ? `"${x.recipient_name}" shares the account holder's surname — likely a dependant`
          : `"${x.recipient_name}" doesn't match the account holder; reviewer may confirm a dependant`,
    });
  }
  if (x.currency && x.currency !== currency) {
    checks.push({ label: "Currency", status: "warn", detail: `Document in ${x.currency}, wallet in ${currency}` });
  }
  return { ...sink, scores: { matchScore, amountScore, dateScore, nameScore, arithmetic } };
}

/** Stage 4 — Purpose classification and business rules. Skipped (neutral scores) when nothing read the bill. */
export function runRules(ctx: PipelineContext, x: Extraction | null): RuleScores {
  const cls = ctx.begin("classify");
  let scores = UNREAD_SCORES;
  if (x) {
    scores = evaluateRules(
      x,
      {
        template: ctx.template,
        vaultName: ctx.vaultName,
        requested: ctx.requested,
        userName: ctx.user.name,
        currency: ctx.user.currency,
        maxDocAgeDays: ctx.rules.verification.maxDocAgeDays,
        now: Date.now(),
      },
      { checks: cls.checks, hardFails: ctx.hardFails, flags: ctx.flags },
    ).scores;
  } else {
    cls.status = "skipped";
    cls.summary = "Needs extracted fields — deferred to reviewer";
  }
  cls.score = scores.matchScore;
  cls.data = { matchScore: scores.matchScore, amountScore: scores.amountScore, dateScore: scores.dateScore, nameScore: scores.nameScore, template: ctx.template };
  ctx.finish(cls);
  return scores;
}
