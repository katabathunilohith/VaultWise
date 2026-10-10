import { useState } from "react";
import { Modal, View } from "react-native";
import { Banner, Button, ModalScreen, PracticeBadge, Segmented, Stack } from "@/components/ui";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { useInvalidateMoney } from "@/lib/api/hooks";
import type { UpdateVaultInput, Vault } from "@/lib/api/types";
import { haptic } from "@/lib/haptics";
import { parseAmount } from "@/lib/money";
import { space } from "@/theme";
import { KeyboardSafe, KeypadFooter, TextField } from "./fields";
import { dateFromChoice, GoalFields, RuleFields, type DateChoice } from "./forms";
import { milestoneLevel, monthlyNeeded, progressOf, ruleDraftFrom, ruleDraftValid, ruleInput, type RuleDraft } from "./format";
import { writeSeenMilestone } from "./hooks";

export type EditTab = "goal" | "rule";

/**
 * Edit a vault's name, goal and auto-save rule (full-screen, mounted while open). Saves through
 * api.updateVault and refreshes every balance.
 */
export function EditVaultModal({ vault, initialTab, onClose }: { vault: Vault; initialTab: EditTab; onClose: () => void }) {
  const [tab, setTab] = useState<EditTab>(initialTab);
  const [name, setName] = useState(vault.name);
  const [target, setTarget] = useState(String(vault.target / 100));
  const [date, setDate] = useState<DateChoice>(vault.targetDate ? "keep" : "none");
  const original = ruleDraftFrom(vault.rule);
  const [rule, setRule] = useState<RuleDraft>(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateMoney();

  const patch: UpdateVaultInput = {};
  const trimmed = name.trim();
  if (trimmed !== vault.name) patch.name = trimmed;
  const targetMinor = parseAmount(target);
  if (targetMinor && targetMinor !== vault.target) patch.target = targetMinor / 100;
  const nextDate = dateFromChoice(date, vault.targetDate);
  if (nextDate !== vault.targetDate) patch.targetDate = nextDate;
  const ruleChanged =
    rule.type !== original.type ||
    (rule.type === "fixed" && (parseAmount(rule.amount) !== parseAmount(original.amount) || rule.frequency !== original.frequency)) ||
    (rule.type === "percent_income" && rule.percent !== original.percent);
  if (ruleChanged) Object.assign(patch, ruleInput(rule));

  const valid = trimmed.length >= 2 && !!targetMinor && ruleDraftValid(rule);
  const dirty = Object.keys(patch).length > 0;
  const keypad = tab === "goal" || rule.type === "fixed";

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateVault(vault.id, patch);
      // Moving the goal isn't saving: note the new quarter quietly so it doesn't celebrate.
      if (patch.target) await writeSeenMilestone(vault.id, milestoneLevel(progressOf(vault.balance, patch.target * 100)));
      await invalidate();
      onClose();
    } catch (e) {
      haptic("error");
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const goalMonthly = monthlyNeeded({
    target: targetMinor ?? vault.target,
    balance: vault.balance,
    targetDate: nextDate,
    monthlyNeeded: null,
  });

  const saveLabel = "Save changes";
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent>
      <KeyboardSafe>
        <ModalScreen
          title="Edit vault"
          onClose={onClose}
          footer={
            keypad ? (
              <KeypadFooter
                stepKey={tab}
                value={tab === "goal" ? target : rule.amount}
                onChange={(v) => (tab === "goal" ? setTarget(v) : setRule({ ...rule, amount: v }))}
                label={saveLabel}
                onPress={save}
                disabled={!dirty || !valid}
                loading={saving}
              />
            ) : (
              <Button key={tab} label={saveLabel} onPress={save} disabled={!dirty || !valid} loading={saving} armOnMount />
            )
          }
        >
          <Stack gap={space.md}>
            <PracticeBadge />
            <Segmented<EditTab>
              value={tab}
              onChange={setTab}
              options={[
                { value: "goal", label: "Goal" },
                { value: "rule", label: "Auto-save" },
              ]}
            />
            {error ? <Banner tone="danger" title="That didn't save" body={`${error} Nothing changed. Try again.`} /> : null}
          </Stack>
          {tab === "goal" ? (
            <View style={{ gap: space.lg }}>
              <TextField
                label="Name"
                value={name}
                onChangeText={setName}
                maxLength={50}
                autoCapitalize="sentences"
                returnKeyType="done"
                hint={trimmed.length < 2 ? "At least 2 characters." : undefined}
              />
              <GoalFields
                amount={target}
                currency={vault.currency}
                date={date}
                onDate={setDate}
                currentDate={vault.targetDate}
                allowNone
                saved={vault.balance}
              />
            </View>
          ) : (
            <RuleFields draft={rule} onChange={setRule} currency={vault.currency} goalMonthly={goalMonthly} />
          )}
        </ModalScreen>
      </KeyboardSafe>
    </Modal>
  );
}
