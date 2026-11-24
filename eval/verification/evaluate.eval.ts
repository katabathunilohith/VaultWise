import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { rulesFor } from "@/lib/compliance";
import { get } from "@/lib/db";
import { VISION_MODEL } from "@/lib/groq";
import { transfer, userAccount, worldAccount } from "@/lib/ledger";
import type { VaultCategory } from "@/lib/shared";
import { createUser, type User } from "@/lib/users";
import { createVault, createWithdrawal, deposit } from "@/lib/vaults";
import { acceptedCategories } from "@/lib/verification/classify";
import {
  createProof,
  PIPELINE_VERSION,
  runPipeline,
  setBillReader,
  validateUpload,
  type Extraction,
  type ProofRow,
  type Stage,
  type VerificationRow,
} from "@/lib/verification/pipeline";

/**
 * Drives the real pipeline (validateUpload → createProof → runPipeline) over the generated dataset, one bill at a
 * time in manifest order, and writes each bill's outcome to EVAL_RAW_OUT. Spawned by eval/verification/run.mjs:
 *   EVAL_CONFIG=stub   the AI read is replaced by an oracle that returns exactly what is printed on the bill
 *   EVAL_CONFIG=no-ai  the customer said no to the AI, so nothing reads the bill (forensics and duplicates only)
 *   EVAL_CONFIG=live   the real Groq vision model, with consent, exactly as production calls it
 */

type Config = "stub" | "no-ai" | "live";
type Outcome = "approve" | "decline" | "review";

interface Visible {
  issuer: string;
  documentType: string;
  category: string;
  recipient: string | null;
  date: string;
  total: number;
  subtotal: number;
  tax: number;
  currency: string;
  reference: string;
  lineItems: { description: string; amount: number }[];
  text: string;
}
interface Item {
  id: string;
  class: string;
  expected: Outcome;
  source: string;
  template: string;
  vault: VaultCategory;
  capture: string;
  description: string;
  edits: string[];
  duplicateOf?: string;
  user: { key: string; name: string };
  requested: number;
  mime: string;
  ageDays: number;
  file: string;
  sha256: string;
  visible: Visible;
}
interface Manifest {
  today: string;
  seed: number;
  market: string;
  currency: string;
  maxDocAgeDays: number;
  counts: Record<string, number>;
  items: Item[];
}

const CONFIG = (process.env.EVAL_CONFIG ?? "stub") as Config;
const DATASET = process.env.EVAL_DATASET ?? path.join(process.cwd(), "eval", "verification", "out", "dataset");
const OUT = process.env.EVAL_RAW_OUT ?? path.join(process.cwd(), "eval", "verification", "out", `raw-${CONFIG}.json`);
const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 0);
const LIMIT = Number(process.env.EVAL_LIMIT ?? 0);

const VAULT_NAMES: Record<VaultCategory, string> = {
  health: "Medical bills",
  education: "School and college fees",
  housing: "Rent and deposit",
  emergency: "Emergency fund",
  retirement: "Retirement",
  custom: "My goal",
};
const SCORED = ["health", "education", "housing", "emergency", "retirement", "other"];

/** The offline stand-in for the vision model: a perfect reader that never judges edits (editing_signs is empty). */
function oracleRead(item: Item, template: VaultCategory): Extraction {
  const v = item.visible;
  const accepted: string[] = acceptedCategories(template);
  return {
    is_document: true,
    document_type: v.documentType,
    issuer: v.issuer,
    recipient_name: v.recipient,
    document_date: v.date,
    total_amount: v.total,
    subtotal: v.subtotal,
    tax: v.tax,
    currency: v.currency,
    reference_number: v.reference,
    line_items: v.lineItems.map((l) => ({ ...l })),
    category_scores: Object.fromEntries(SCORED.map((c) => [c, c === v.category ? 0.9 : 0.04])),
    purpose_match: accepted.includes(v.category) ? 0.9 : 0.05,
    editing_signs: [],
    legibility: 0.95,
    text: v.text,
    summary: `${v.documentType.replace(/_/g, " ")} from ${v.issuer}`,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const toOutcome = (d: VerificationRow["decision"]): Outcome => (d === "auto_approved" ? "approve" : d === "auto_denied" ? "decline" : "review");
const round = (n: unknown, dp = 3) => (typeof n === "number" ? Number(n.toFixed(dp)) : null);
/** Progress straight to the terminal (vitest holds console output of a running test until it ends). */
const progress = (line: string) => fs.writeSync(1, `${line}
`);

it(`evaluates the verification pipeline (${CONFIG})`, async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(DATASET, "manifest.json"), "utf8")) as Manifest;
  const rules = rulesFor(manifest.market);
  // The labels assume India's document-age limit; if the policy moved, the "stale" class would be mislabelled.
  expect(rules.verification.maxDocAgeDays, "compliance maxDocAgeDays changed: update MAX_DOC_AGE_DAYS in generate.mjs").toBe(manifest.maxDocAgeDays);
  const today = new Date().toISOString().slice(0, 10);
  if (today !== manifest.today) progress(`[eval] dataset was generated for ${manifest.today}, today is ${today}: regenerate for exact dates`);

  const items = LIMIT > 0 ? manifest.items.slice(0, LIMIT) : manifest.items;
  const byFile = new Map(items.map((i) => [i.file, i]));
  if (CONFIG === "stub") setBillReader(async ({ proof }) => oracleRead(byFile.get(proof.file_name)!, proof.category));
  if (CONFIG === "live") {
    if (!process.env.GROQ_LIVE_KEY) throw new Error("live mode needs GROQ_LIVE_KEY (run.mjs reads GROQ_API_KEY from .env.local)");
    process.env.GROQ_API_KEY = process.env.GROQ_LIVE_KEY;
  }

  const users = new Map<string, string>();
  const vaults = new Map<string, string>();
  const fresh = (id: string) => get<User>("SELECT * FROM users WHERE id = ?", id)!;
  const userFor = (item: Item) => {
    let id = users.get(item.user.key);
    if (!id) {
      id = createUser({ name: item.user.name, country: manifest.market, pin: "2468" }).id;
      const u = fresh(id);
      transfer({ userId: id, from: worldAccount(u.currency).id, to: userAccount(id, "bank", u.currency).id, amount: 50_00_000_00, kind: "income", memo: "evaluation seed" });
      users.set(item.user.key, id);
    }
    return fresh(id);
  };
  const vaultFor = (user: User, item: Item) => {
    const key = `${item.user.key}:${item.vault}`;
    let id = vaults.get(key);
    if (!id) {
      id = createVault(user, { name: VAULT_NAMES[item.vault], category: item.vault, target: 10_00_000_00 });
      deposit(fresh(user.id), id, 5_00_000_00);
      vaults.set(key, id);
    }
    return id;
  };

  const proofToItem = new Map<string, string>();
  const normalise = (s: string) => s.replace(/prf_[A-Za-z0-9_-]{12}/g, (pid) => `[${proofToItem.get(pid) ?? "earlier proof"}]`);
  const results = [];
  const startedAt = new Date().toISOString();

  for (const [n, item] of items.entries()) {
    const user = userFor(item);
    const vaultId = vaultFor(user, item);
    const withdrawalId = createWithdrawal(user, vaultId, item.requested, item.visible.issuer);
    const buffer = fs.readFileSync(path.join(DATASET, item.file));
    await validateUpload(buffer, item.mime);
    const proofId = createProof(fresh(user.id), {
      buffer,
      fileName: item.file,
      mime: item.mime,
      purpose: "withdrawal",
      category: item.vault,
      vaultId,
      withdrawalId,
      aiAllowed: CONFIG !== "no-ai",
    });
    proofToItem.set(proofId, item.id);
    const t0 = Date.now();
    await runPipeline(proofId);
    const ms = Date.now() - t0;

    const v = get<VerificationRow>("SELECT * FROM verifications WHERE proof_id = ?", proofId)!;
    const p = get<ProofRow>("SELECT * FROM proofs WHERE id = ?", proofId)!;
    const w = get<{ status: string }>("SELECT status FROM withdrawals WHERE id = ?", withdrawalId)!;
    const stages = JSON.parse(v.stages) as Stage[];
    const stage = (key: string) => stages.find((s) => s.key === key);
    const data = (key: string) => (stage(key)?.data ?? {}) as Record<string, unknown>;
    const x = p.extracted ? (JSON.parse(p.extracted) as Extraction) : null;
    const visionCheck = stage("extract")?.checks.find((c) => c.label === "Vision model");
    const exif = (data("preprocess").exif ?? {}) as { software?: string };
    const accepted: string[] = acceptedCategories(item.vault);
    const actual = toOutcome(v.decision);

    results.push({
      id: item.id,
      class: item.class,
      expected: item.expected,
      actual,
      correct: actual === item.expected,
      vault: item.vault,
      source: item.source,
      capture: item.capture,
      description: item.description,
      edits: item.edits,
      duplicateOf: item.duplicateOf ?? null,
      status: v.status,
      decision: v.decision,
      confidence: round(v.confidence, 4),
      reasons: (JSON.parse(v.reasons ?? "[]") as string[]).map(normalise),
      checks: stages.flatMap((s) => s.checks.filter((c) => c.status === "fail" || c.status === "warn").map((c) => `${s.key}: ${c.status} ${c.label}: ${normalise(c.detail)}`)),
      signals: {
        ela: round(data("tamper").elaScore),
        elaCluster: data("tamper").largestCluster ?? null,
        elaInconclusive: data("tamper").elaInconclusive === true,
        tamper: round(data("tamper").tamperScore),
        corroborating: (data("tamper").corroborating as string[] | undefined) ?? [],
        purpose: round(data("classify").matchScore),
        amount: round(data("classify").amountScore),
        date: round(data("classify").dateScore),
        name: round(data("classify").nameScore),
        extraction: round(stage("extract")?.score),
        exifSoftware: exif.software ?? null,
        contentReuse: !!data("tamper").contentDup,
      },
      ai:
        CONFIG === "live"
          ? {
              problem: visionCheck && visionCheck.status !== "info" ? visionCheck.detail : null,
              read: x
                ? {
                    documentType: x.document_type,
                    issuer: x.issuer,
                    recipient: x.recipient_name,
                    date: x.document_date,
                    total: x.total_amount,
                    reference: x.reference_number,
                    categoryForVault: Math.max(...accepted.map((c) => Number(x.category_scores?.[c] ?? 0))),
                    purposeMatch: x.purpose_match,
                    editingSigns: x.editing_signs,
                    isDocument: x.is_document,
                  }
                : null,
            }
          : null,
      withdrawal: w.status,
      ms,
    });
    progress(
      `[${String(n + 1).padStart(2)}/${items.length}] ${item.id.padEnd(32)} ${item.class.padEnd(13)} expected ${item.expected.padEnd(7)} got ${actual.padEnd(7)} conf ${(v.confidence ?? 0).toFixed(2)}${visionCheck && visionCheck.status === "fail" ? `  AI: ${visionCheck.detail}` : ""}`,
    );
    if (CONFIG === "live" && DELAY_MS > 0 && n < items.length - 1) await sleep(DELAY_MS);
  }

  const raw = {
    config: CONFIG,
    mode: CONFIG === "live" ? "live" : "offline",
    reader: CONFIG === "stub" ? "oracle stub (prints-what-is-on-the-bill, no edit judgement)" : CONFIG === "no-ai" ? "none (customer said no to the AI)" : `Groq ${VISION_MODEL}`,
    pipelineVersion: PIPELINE_VERSION,
    visionModel: VISION_MODEL,
    market: manifest.market,
    maxDocAgeDays: rules.verification.maxDocAgeDays,
    thresholds: { autoApprove: rules.verification.autoApprove, autoDeny: rules.verification.autoDeny },
    datasetDate: manifest.today,
    seed: manifest.seed,
    startedAt,
    finishedAt: new Date().toISOString(),
    delayMs: CONFIG === "live" ? DELAY_MS : 0,
    items: results,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(raw, null, 2)}\n`);
  expect(results).toHaveLength(items.length);
});
