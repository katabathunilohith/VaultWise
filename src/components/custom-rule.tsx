"use client";

import { useState } from "react";
import { Card, CardTitle, Field, Input } from "@/components/ui";

/**
 * Custom vault rules on the web: write your own rule for a custom vault instead of borrowing a
 * category's. Turn it off with the flag below; to remove it, delete this file and the lines marked
 * "custom-rules" in app/vaults/page.tsx, app/vaults/[id]/page.tsx and the admin review page.
 * The server side lives in lib/custom-rules.ts.
 */
export const CUSTOM_RULES_ENABLED = true;

export interface CustomRule {
  uses: string[];
  proof: string;
}

const MAX_USES = 5;

/** Splits "Venue, Catering; Flights" into tidy items the server accepts (2 to 60 characters, at most 5). */
function usesFrom(text: string) {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim().slice(0, 60))
    .filter((s) => s.length >= 2)
    .slice(0, MAX_USES);
}

/** Form state for a rule. `value()` is the request body field, or undefined while incomplete. */
export function useCustomRuleDraft() {
  const [usesText, setUsesText] = useState("");
  const [proof, setProof] = useState("");
  const uses = usesFrom(usesText);
  const valid = uses.length > 0 && proof.trim().length >= 4;
  return {
    usesText,
    setUsesText,
    proof,
    setProof,
    valid,
    value: (): CustomRule | undefined => (valid ? { uses, proof: proof.trim().slice(0, 120) } : undefined),
  };
}

export type CustomRuleDraft = ReturnType<typeof useCustomRuleDraft>;

export function CustomRuleFields({ draft }: { draft: CustomRuleDraft }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="What can this money pay for?" hint="Up to 5 things, separated by commas. For example: venue, catering, rings.">
        <Input value={draft.usesText} onChange={(e) => draft.setUsesText(e.target.value)} placeholder="Venue, catering, rings" maxLength={320} />
      </Field>
      <Field label="What proof will you show?" hint="A person checks every withdrawal against your rule.">
        <Input value={draft.proof} onChange={(e) => draft.setProof(e.target.value)} placeholder="An invoice or booking confirmation" maxLength={120} />
      </Field>
    </div>
  );
}

/** The rule as the reviewer and the owner see it. */
export function CustomRuleCard({ rule, title = "The customer's own rule" }: { rule: CustomRule; title?: string }) {
  return (
    <Card>
      <CardTitle sub="A person checks each withdrawal against this rule.">{title}</CardTitle>
      <div className="space-y-2 text-sm">
        <div>
          <div className="text-[13px] text-muted">Can pay for</div>
          <ul className="mt-1 list-inside list-disc">
            {rule.uses.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[13px] text-muted">Proof promised</div>
          <p className="mt-1">{rule.proof}</p>
        </div>
      </div>
    </Card>
  );
}
