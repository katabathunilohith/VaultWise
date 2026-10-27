import { z } from "zod";
import { body, customer, handle, json, minor } from "@/lib/api";
import { createVault, deposit, listVaults } from "@/lib/vaults";
import { CustomRuleSchema, saveCustomRule } from "@/lib/custom-rules";

export const GET = handle(async () => {
  // identity: open to a sign-in with provisional recovery access (read-only summary).
  const user = await customer({ access: "read", recovery: true });
  return json({ vaults: listVaults(user), currency: user.currency });
});

const Category = z.enum(["health", "education", "housing", "emergency", "retirement", "custom"]);
const Create = z.object({
  name: z.string().trim().min(2).max(50),
  category: Category,
  template: Category.optional(),
  // custom-rules: the owner's own rule for a custom vault (used instead of a template).
  customRule: CustomRuleSchema.optional(),
  target: z.number().positive(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  ruleType: z.enum(["none", "fixed", "percent_income", "roundup"]).default("none"),
  ruleAmount: z.number().positive().optional(),
  rulePercent: z.number().min(1).max(50).optional(),
  ruleFrequency: z.enum(["weekly", "biweekly", "monthly"]).optional(),
  initialDeposit: z.number().positive().optional(),
  isJoint: z.boolean().optional(),
  members: z
    .array(z.object({ name: z.string().trim().min(2), email: z.string().email().optional() }))
    .max(4)
    .optional(),
});

export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, Create);
  const id = createVault(user, {
    name: b.name,
    category: b.category,
    // custom-rules: a vault with its own rule keeps the "custom" template (a person confirms).
    template: b.category === "custom" && !b.customRule ? b.template : undefined,
    target: minor(b.target),
    targetDate: b.targetDate ?? null,
    ruleType: b.ruleType,
    ruleAmount: b.ruleType === "fixed" && b.ruleAmount ? minor(b.ruleAmount) : null,
    rulePercent: b.ruleType === "percent_income" ? (b.rulePercent ?? 5) : null,
    ruleFrequency: b.ruleType === "fixed" ? (b.ruleFrequency ?? "monthly") : null,
    isJoint: b.isJoint,
    members: b.members,
  });
  if (b.category === "custom" && b.customRule) saveCustomRule(id, b.customRule); // custom-rules
  if (b.initialDeposit) deposit(user, id, minor(b.initialDeposit), { memo: "Opening contribution" });
  return json({ id }, { status: 201 });
});
