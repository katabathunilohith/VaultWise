import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LockIcon } from "@/components/icons";
import { Banner, Button, Celebration, ModalScreen, PracticeBadge, Stack, Txt } from "@/components/ui";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { useInvalidateMoney } from "@/lib/api/hooks";
import type { VaultCategory } from "@/lib/api/types";
import { emoji3d } from "@/lib/categories";
import { haptic } from "@/lib/haptics";
import { parseAmount } from "@/lib/money";
import { space } from "@/theme";
import { KeyboardSafe, KeypadFooter } from "./fields";
import { dateFromChoice, GoalFields, RuleFields, type DateChoice } from "./forms";
import { ruleDraftFrom, ruleDraftValid, ruleInput, type RuleDraft } from "./format";
import { useCurrency, writeSeenMilestone } from "./hooks";
import { NameStep, PurposeStep, ReviewSummary, StepTitle } from "./NewVaultSteps";
import { ReleaseContract } from "./ReleaseContract";

const STEPS = 5;

/** Purposes a link can preselect (a custom vault also needs its template, so it's picked here). */
const PRESETS: VaultCategory[] = ["health", "education", "housing", "emergency", "retirement"];
const presetFrom = (raw: string | string[] | undefined): VaultCategory | null => {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return PRESETS.find((k) => k === v) ?? null;
};

/**
 * New vault (full-screen modal): purpose → name → goal → auto-save → "Lock it" review with the
 * release contract. Back after step 1; Continue / Lock it always in the bottom slot (R1).
 *
 * Opened from a checkout (`from=checkout`, with the bill's `category`), the purpose starts on that
 * category, and finishing goes back to the checkout so the bill can be paid from the new vault.
 */
export function NewVaultScreen() {
  const params = useLocalSearchParams<{ from?: string; category?: string }>();
  const fromCheckout = params.from === "checkout";
  const currency = useCurrency();
  const invalidate = useInvalidateMoney();
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<VaultCategory | null>(() => presetFrom(params.category));
  const [template, setTemplate] = useState<VaultCategory | null>(null);
  const [name, setName] = useState("");
  const [joint, setJoint] = useState(false);
  const [member, setMember] = useState("");
  const [target, setTarget] = useState("");
  const [months, setMonths] = useState<DateChoice>(12);
  const [rule, setRule] = useState<RuleDraft>(() => ruleDraftFrom(null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const targetMinor = parseAmount(target) ?? 0;
  const targetDate = dateFromChoice(months, null);
  const monthsCount = typeof months === "number" ? months : 12;
  const valid = [
    !!category && (category !== "custom" || !!template),
    name.trim().length >= 2 && (!joint || member.trim().length >= 2),
    targetMinor > 0,
    ruleDraftValid(rule),
    true,
  ][step];

  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));
  const back =
    step > 0
      ? () => {
          if (!saving && !createdId) setStep((s) => s - 1);
        }
      : undefined;

  const create = async () => {
    if (!category) return;
    setSaving(true);
    setError(null);
    try {
      const { id } = await api.createVault({
        name: name.trim(),
        category,
        template: category === "custom" && template ? template : undefined,
        target: targetMinor / 100,
        targetDate,
        ...ruleInput(rule),
        isJoint: joint || undefined,
        members: joint ? [{ name: member.trim() }] : undefined,
      });
      // A new vault starts at zero: remember that so its first quarter can be celebrated later.
      await writeSeenMilestone(id, 0);
      void invalidate();
      setCreatedId(id);
    } catch (e) {
      haptic("error");
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // The celebration can end twice (a tap, then its timer); leave once, or Back would also close the checkout.
  const left = useRef(false);
  const finish = useCallback(() => {
    if (!createdId || left.current) return;
    left.current = true;
    // Back to the checkout underneath: it reloads on focus and can now pay from the new vault.
    if (fromCheckout && router.canGoBack()) router.back();
    else router.dismissTo(`/vaults/${createdId}`);
  }, [createdId, fromCheckout]);

  const keypadValue = step === 2 ? target : rule.amount;
  const setKeypad = (v: string) => (step === 2 ? setTarget(v) : setRule({ ...rule, amount: v }));
  const keypad = step === 2 || (step === 3 && rule.type === "fixed");

  const footer = keypad ? (
    <KeypadFooter stepKey={step} value={keypadValue} onChange={setKeypad} label="Continue" disabled={!valid} onPress={next} />
  ) : step === STEPS - 1 ? (
    <Button key="lock" label="Lock it" icon={LockIcon} onPress={create} loading={saving} disabled={!!createdId} armOnMount />
  ) : (
    <Button key={step} label="Continue" onPress={next} disabled={!valid} armOnMount />
  );

  return (
    <View style={{ flex: 1 }}>
      <KeyboardSafe>
        <ModalScreen title="New vault" back={back} footer={footer}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
            <Txt v="caption" color="textMuted">
              Step {step + 1} of {STEPS}
            </Txt>
            <PracticeBadge />
          </View>

          {step === 0 ? (
            <PurposeStep
              category={category}
              template={template}
              onCategory={(k) => {
                setCategory(k);
                if (k !== "custom") setTemplate(null);
              }}
              onTemplate={setTemplate}
            />
          ) : null}

          {step === 1 && category ? (
            <NameStep
              category={category}
              name={name}
              onName={setName}
              joint={joint}
              onJoint={setJoint}
              member={member}
              onMember={setMember}
              onSubmit={() => valid && next()}
            />
          ) : null}

          {step === 2 ? (
            <Stack gap={space.lg}>
              <StepTitle title="Set the goal" body="How much, and by when." />
              <GoalFields amount={target} currency={currency} date={months} onDate={setMonths} />
            </Stack>
          ) : null}

          {step === 3 ? (
            <Stack gap={space.lg}>
              <StepTitle title="How will it fill up?" body="You can change this any time." />
              <RuleFields draft={rule} onChange={setRule} currency={currency} goalMonthly={targetMinor > 0 ? targetMinor / monthsCount : null} />
            </Stack>
          ) : null}

          {step === 4 && category ? (
            <Stack gap={space.lg}>
              <StepTitle title="Lock it in" body="Read how it unlocks, then lock it." />
              {error ? <Banner tone="danger" title="The vault wasn't made" body={`${error} Nothing was saved. Try again.`} /> : null}
              <ReviewSummary
                category={category}
                template={template}
                name={name.trim()}
                member={joint ? member.trim() : null}
                target={targetMinor}
                targetDate={targetDate}
                rule={rule}
                currency={currency}
              />
              <ReleaseContract category={category} template={template} showSupportLink={false} />
              <Txt v="bodyM" color="textMuted">
                You can change the goal and auto-save later. What unlocks it stays the same.
              </Txt>
            </Stack>
          ) : null}
        </ModalScreen>
      </KeyboardSafe>
      <Celebration
        visible={!!createdId}
        image={emoji3d.party}
        title="Vault locked in"
        body={`${name.trim()} is ready. Add money any time.`}
        haptic="vault.locked"
        onDone={finish}
      />
    </View>
  );
}
