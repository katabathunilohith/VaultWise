import { z } from "zod";
import { body, customer, handle, json, minor } from "@/lib/api";
import { all, run } from "@/lib/db";
import { audit } from "@/lib/audit";
import { accountHistory } from "@/lib/ledger";
import { getVaultRow, nextRun, toView } from "@/lib/vaults";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await customer();
  const v = getVaultRow(user, id);
  const withdrawals = all(
    `SELECT w.*, v.decision, v.final_decision, v.confidence FROM withdrawals w
     LEFT JOIN verifications v ON v.proof_id = w.proof_id
     WHERE w.vault_id = ? ORDER BY w.created_at DESC LIMIT 30`,
    id,
  );
  const history = accountHistory(v.account_id, 100);
  // Running balance series for the chart (oldest → newest).
  let bal = 0;
  const series = [...history].reverse().map((h) => {
    bal += h.amount;
    return { t: h.created_at, balance: bal };
  });
  return json({ vault: toView(v, user.currency), history, series, withdrawals, currency: user.currency, userName: user.name });
});

const Patch = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  target: z.number().positive().optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  ruleType: z.enum(["none", "fixed", "percent_income", "roundup"]).optional(),
  ruleAmount: z.number().positive().optional(),
  rulePercent: z.number().min(1).max(50).optional(),
  ruleFrequency: z.enum(["weekly", "biweekly", "monthly"]).optional(),
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await customer({ tick: false });
  const v = getVaultRow(user, id);
  const b = await body(req, Patch);
  if (b.name) run("UPDATE vaults SET name = ? WHERE id = ?", b.name, id);
  if (b.target) run("UPDATE vaults SET target_amount = ? WHERE id = ?", minor(b.target), id);
  if (b.targetDate !== undefined) run("UPDATE vaults SET target_date = ? WHERE id = ?", b.targetDate, id);
  if (b.ruleType) {
    const freq = b.ruleFrequency ?? v.rule_frequency ?? "monthly";
    run(
      "UPDATE vaults SET rule_type = ?, rule_amount = ?, rule_percent = ?, rule_frequency = ?, next_run_at = ? WHERE id = ?",
      b.ruleType,
      b.ruleType === "fixed" ? minor(b.ruleAmount ?? (v.rule_amount ?? 0) / 100) : null,
      b.ruleType === "percent_income" ? (b.rulePercent ?? v.rule_percent ?? 5) : null,
      b.ruleType === "fixed" ? freq : null,
      b.ruleType === "fixed" ? nextRun(Date.now(), freq) : null,
      id,
    );
  }
  audit({ userId: user.id, actor: user.id, actorType: "user", action: "vault.updated", entityType: "vault", entityId: id, details: b });
  return json({ ok: true });
});
