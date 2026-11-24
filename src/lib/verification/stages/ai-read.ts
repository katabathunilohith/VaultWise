import { run } from "../../db";
import { customRuleFor, customRulePrompt } from "../../custom-rules";
import { AiError, aiEnabled, chatJson, describeAiError, VISION_MODEL } from "../../groq";
import { CATEGORIES, fmtMoney, type VaultCategory } from "../../shared";
import type { Extraction, ProofRow } from "../types";
import { clamp, type PipelineContext } from "./context";

/** custom-rules: the vault's own rule as a prompt line, if it has one. */
const customRuleLine = (vaultId: string) => {
  const rule = customRuleFor(vaultId);
  return rule ? customRulePrompt(rule) : null;
};

export function extractionPrompt(ctx: {
  category: VaultCategory;
  vaultName: string;
  /** custom-rules: the owner's own rule, as a prompt line. */
  customRule?: string | null;
  amount: number | null;
  currency: string;
  userName: string;
  today: string;
}) {
  return `You are the document-understanding stage of a savings app's proof-of-purpose verifier.
The user is withdrawing ${ctx.amount != null ? fmtMoney(ctx.amount, ctx.currency) : "funds"} from a vault named "${ctx.vaultName}" (category: ${CATEGORIES[ctx.category].label}). Today is ${ctx.today}.${ctx.customRule ? `
${ctx.customRule}` : ""}
Read the image and return JSON with exactly these keys:
- is_document: boolean — true only if this is a real bill/receipt/invoice/agreement/statement (not a selfie, meme, blank page or unrelated photo)
- document_type: short snake_case type, e.g. medical_invoice, pharmacy_receipt, tuition_invoice, rent_receipt, lease_agreement, utility_bill, repair_invoice, travel_booking, pension_statement, retail_receipt, other
- issuer: issuing organisation or null
- recipient_name: person billed / patient / student / tenant, or null
- document_date: ISO date YYYY-MM-DD or null
- total_amount: final total due/paid as a number (no currency symbol) or null
- subtotal: subtotal before tax as a number, or null
- tax: tax amount as a number, or null
- currency: ISO 4217 code or null
- reference_number: invoice/receipt number or null
- line_items: array of {description, amount} for the itemised charges only (exclude subtotal, tax and total rows)
- category_scores: object with keys health, education, housing, emergency, retirement, other — each 0..1, how well the document fits that savings purpose
- purpose_match: 0..1 — how plausibly this document justifies spending from a vault named "${ctx.vaultName}"
- editing_signs: array of visual signs of digital alteration (mismatched fonts or sizes, misaligned digits, inconsistent background or blur around numbers, totals that don't add up). Empty if none.
- legibility: 0..1
- text: the document's key text, max 600 characters
- summary: one plain sentence describing the document
Return JSON only.`;
}

/** What the extract stage hands the reader: the prepared image and the prompt built for this proof. */
export interface BillReadInput {
  proof: ProofRow;
  /** The pre-processed JPEG. */
  image: Buffer;
  prompt: string;
}
/** Reads a bill into fields. Production: the Groq vision model. */
export type BillReader = (input: BillReadInput) => Promise<Extraction>;

const groqBillReader: BillReader = ({ image, prompt }) =>
  chatJson<Extraction>(
    [
      {
        role: "system",
        content: "You extract structured fields from financial documents. Respond with a single JSON object.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image.toString("base64")}` } },
        ],
      },
    ],
    { model: VISION_MODEL, temperature: 0, maxTokens: 900, timeoutMs: 60_000 },
  );

let readerOverride: BillReader | null = null;
/**
 * Swaps the bill reader (null restores the vision model). Only the offline evaluation (eval/verification) and
 * tests use it. The customer's answer still comes first: with ai_allowed = 0 no reader is called.
 */
export function setBillReader(fn: BillReader | null) {
  readerOverride = fn;
}

/**
 * A money amount from the model: a number, or text such as "₹1,200.50", "Rs. 99" or "Rs. 500/-". Takes the first
 * number in the text (stripping every non-digit used to keep the "." of "Rs.", so "Rs. 99" read as 0.99). 0 → null.
 */
export function parseAmount(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v || null;
  const m = String(v).match(/-?\d[\d,]*(?:\.\d+)?/);
  return m ? Number(m[0].replace(/,/g, "")) || null : null;
}

/** Fills defaults and coerces the model's numbers ("₹1,200" → 1200), in place. Throws on a malformed answer. */
export function normaliseExtraction(x: Extraction) {
  x.category_scores ??= {};
  x.editing_signs ??= [];
  x.line_items ??= [];
  x.legibility = clamp(Number(x.legibility ?? 0.5));
  x.purpose_match = clamp(Number(x.purpose_match ?? 0));
  x.total_amount = parseAmount(x.total_amount);
  x.subtotal = parseAmount(x.subtotal);
  x.tax = parseAmount(x.tax);
  x.line_items = x.line_items.map((l) => ({ description: String(l.description ?? ""), amount: parseAmount(l.amount) }));
  return x;
}

/**
 * Stage 3 — OCR & layout understanding. Only with the customer's yes (ai_allowed) and a reader (a Groq key, or
 * the evaluation's stand-in). Returns the fields, or null when nothing read the bill (a person will).
 */
export async function runAiRead(ctx: PipelineContext, image: Buffer): Promise<Extraction | null> {
  const { proof, vault, template, user } = ctx;
  const ext = ctx.begin("extract");
  let x: Extraction | null = null;
  if (!proof.ai_allowed) {
    ext.status = "skipped";
    ext.summary = "The customer asked for a person to read it — routing to a human reviewer";
    ext.checks.push({ label: "Vision model", status: "info", detail: "Not used: the customer said no to the AI reading their documents" });
  } else if (!readerOverride && !aiEnabled()) {
    ext.status = "skipped";
    ext.summary = "Vision model unavailable — routing to a human reviewer";
    ext.checks.push({ label: "Vision model", status: "warn", detail: "GROQ_API_KEY not configured" });
  } else {
    try {
      x = await (readerOverride ?? groqBillReader)({
        proof,
        image,
        prompt: extractionPrompt({
          category: template,
          vaultName: ctx.vaultName,
          // custom-rules
          customRule: vault && template === "custom" ? customRuleLine(vault.id) : null,
          amount: ctx.requested,
          currency: user.currency,
          userName: user.name,
          today: new Date().toISOString().slice(0, 10),
        }),
      });
      normaliseExtraction(x);
      run("UPDATE proofs SET extracted = ? WHERE id = ?", JSON.stringify(x), proof.id);
      const found = [x.issuer, x.document_date, x.total_amount != null ? "amount" : null, x.document_type].filter(Boolean).length;
      ext.checks.push({ label: "Document detected", status: x.is_document ? "pass" : "fail", detail: x.summary || x.document_type });
      ext.checks.push({
        label: "Fields extracted",
        status: found >= 3 ? "pass" : "warn",
        detail: `${found}/4 key fields · legibility ${(x.legibility * 100).toFixed(0)}%`,
      });
      if (!x.is_document) ctx.hardFails.push({ reason: "The upload doesn't appear to be a bill, receipt or agreement", forensic: false });
      ext.score = clamp((x.is_document ? 0.5 : 0) + (found / 4) * 0.3 + x.legibility * 0.2);
      ext.data = {
        documentType: x.document_type,
        issuer: x.issuer,
        recipient: x.recipient_name,
        date: x.document_date,
        total: x.total_amount,
        currency: x.currency,
        reference: x.reference_number,
        lineItems: x.line_items.slice(0, 8),
      };
    } catch (e) {
      ext.status = "failed";
      ext.summary = "Vision model call failed — routing to a human reviewer";
      if (!(e instanceof AiError)) console.warn("[verify] vision step", e);
      ext.checks.push({ label: "Vision model", status: "fail", detail: describeAiError(e) });
    }
  }
  ctx.finish(ext);
  return x;
}
