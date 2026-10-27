import { useState } from "react";
import { CUSTOM_RULES_ENABLED } from "./config";
import { draftValid, emptyDraft, toCustomRule, type OwnRuleDraft } from "./model";

export type RuleSource = "own" | "template";

/**
 * State for "which rules should a custom vault follow?" in the new-vault flow. `active` is true
 * when the person is writing their own rule; `rule` is what to send with the vault.
 */
export function useOwnRule() {
  const [source, setSource] = useState<RuleSource>(CUSTOM_RULES_ENABLED ? "own" : "template");
  const [draft, setDraft] = useState<OwnRuleDraft>(emptyDraft);
  const active = CUSTOM_RULES_ENABLED && source === "own";
  return {
    enabled: CUSTOM_RULES_ENABLED,
    source,
    setSource,
    draft,
    setDraft,
    active,
    valid: draftValid(draft),
    rule: active ? toCustomRule(draft) : null,
  };
}

export type OwnRuleState = ReturnType<typeof useOwnRule>;
