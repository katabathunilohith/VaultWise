import { useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { CheckCircleIcon } from "@/components/icons";
import { Amount, AmountKeypad, Banner, Button, PracticeBadge, Stack, Txt } from "@/components/ui";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { LimitKey, LimitsOverview } from "@/lib/api/types";
import { haptic } from "@/lib/haptics";
import { moneyWhole, parseAmount } from "@/lib/money";
import { space, useTheme } from "@/theme";
import { HandPalmIcon } from "../../icons";
import { StepScreen } from "../../layout";
import { limitMeta, shortDate, type EditMode } from "./limitMeta";

type Step = "check" | "amount" | "done";

/**
 * Change one limit, in a full-screen modal. A raise starts with the scam check (before the form),
 * then the amount; lowering goes straight to the amount and applies at once.
 */
export function LimitEditor({
  limitKey,
  mode,
  overview,
  onClose,
}: {
  limitKey: LimitKey;
  mode: EditMode;
  overview: LimitsOverview;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(mode === "raise" ? "check" : "amount");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [saved, setSaved] = useState<LimitsOverview | null>(null);

  const meta = limitMeta(limitKey);
  const cur = overview.currency;
  const current = overview.limits[limitKey];
  const bounds = overview.bounds[limitKey];
  const amount = parseAmount(value);
  const problem = validate(mode, amount, current, bounds, cur);
  const overMax = mode === "raise" && amount !== null && amount > bounds.max;

  // A heads-up the moment the amount goes past the country maximum (a safety limit, not an error).
  const wasOver = useRef(false);
  useEffect(() => {
    if (overMax && !wasOver.current) haptic("warning");
    wasOver.current = overMax;
  }, [overMax]);

  const talkToUs = () => {
    onClose();
    router.push("/support");
  };

  const save = async () => {
    if (amount === null || problem) return;
    setSaving(true);
    setFailure(null);
    try {
      const res = await api.setLimits({ [limitKey]: amount / 100 });
      setSaved(res.overview);
      // The emergency overview shows the monthly emergency limit, so it's re-read too.
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === "limits" || q.queryKey[1] === "emergency" });
      setStep("done");
    } catch (e) {
      haptic("error");
      setFailure(e);
    } finally {
      setSaving(false);
    }
  };

  let body;
  if (step === "check") {
    body = (
      <StepScreen
        close={onClose}
        footer={
          <>
            <Button label="I'm doing this myself" variant="tonal" size="md" onPress={() => setStep("amount")} />
            <Button label="Talk to us" armOnMount onPress={talkToUs} />
          </>
        }
      >
        <ScamCheck />
      </StepScreen>
    );
  } else if (step === "done") {
    body = (
      <StepScreen footer={<Button label="Done" armOnMount onPress={onClose} />}>
        <Done
          mode={mode}
          noun={meta.noun}
          value={saved?.limits[limitKey] ?? amount ?? current}
          currency={cur}
          resetsAt={(saved ?? overview).quota.resetsAt}
        />
      </StepScreen>
    );
  } else {
    body = (
      <StepScreen
        back={mode === "raise" ? () => setStep("check") : undefined}
        close={mode === "raise" ? undefined : onClose}
        scroll={false}
        footer={
          <Button
            label={
              amount !== null && !problem
                ? `${mode === "raise" ? "Raise" : "Lower"} to ${moneyWhole(amount, cur)}`
                : mode === "raise"
                  ? "Raise limit"
                  : "Lower limit"
            }
            disabled={amount === null || !!problem}
            loading={saving}
            armOnMount
            onPress={() => void save()}
          />
        }
      >
        <Stack gap={space.xs}>
          <PracticeBadge compact />
          <Txt v="titleL" accessibilityRole="header">
            {`${mode === "raise" ? "Raise" : "Lower"} your ${meta.noun}`}
          </Txt>
          <Txt v="bodyM" color="textMuted">
            {mode === "raise"
              ? `Now ${moneyWhole(current, cur)}. Up to ${moneyWhole(bounds.max, cur)} in your country.`
              : `Now ${moneyWhole(current, cur)}. A lower limit applies straight away.`}
          </Txt>
        </Stack>
        <View style={styles.amount} accessibilityLiveRegion="polite">
          <Amount value={amount ?? 0} currency={cur} size="l" hideDecimals animate={false} align="center" />
          <Txt v="bodyM" color={problem && amount !== null ? "text" : "textMuted"} align="center">
            {amount === null
              ? "Enter the new limit"
              : (problem ?? (mode === "raise" ? "You can raise a limit once a month." : "You can lower it again any time."))}
          </Txt>
        </View>
        {failure ? <Banner tone="danger" title="That didn't save" body={`${errorMessage(failure)} Nothing changed.`} /> : null}
        <View style={styles.spacer} />
        <AmountKeypad value={value} onChange={setValue} maxDecimals={0} />
      </StepScreen>
    );
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      // Draw under the system bars on Android so safe-area insets line up with the rest of the app.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {body}
    </Modal>
  );
}

function validate(mode: EditMode, amount: number | null, current: number, bounds: { min: number; max: number }, cur: string): string | null {
  if (amount === null) return "Enter an amount";
  if (mode === "lower") {
    if (amount >= current) return `Enter less than ${moneyWhole(current, cur)}.`;
    if (amount < bounds.min) return `The lowest is ${moneyWhole(bounds.min, cur)}.`;
    return null;
  }
  if (amount <= current) return `Enter more than ${moneyWhole(current, cur)}.`;
  if (amount > bounds.max) return `The most for your country is ${moneyWhole(bounds.max, cur)}.`;
  return null;
}

/** The scam interstitial, shown before any raise. Calm, plain, with a person one tap away. */
function ScamCheck() {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.lg, paddingTop: space.lg }}>
      <View style={[styles.icon, { backgroundColor: c.surfaceRaised }]}>
        <HandPalmIcon size={36} color={c.text} />
      </View>
      <Txt v="headline" accessibilityRole="header">
        Is someone telling you to do this?
      </Txt>
      <Txt v="bodyL">
        Real banks, police and tax offices never ask you to raise a limit and move money. If anyone&apos;s rushing you, stop here — tap Talk to us.
      </Txt>
      <Txt v="bodyM" color="textMuted">
        A person will help you check, and nothing changes while you talk.
      </Txt>
    </View>
  );
}

function Done({ mode, noun, value, currency, resetsAt }: { mode: EditMode; noun: string; value: number; currency: string; resetsAt: number }) {
  const { c } = useTheme();
  return (
    <View style={styles.done}>
      <CheckCircleIcon size={56} color={c.success} weight="fill" />
      <Txt v="headline" align="center" accessibilityRole="header">
        {mode === "raise" ? "Limit raised" : "Limit lowered"}
      </Txt>
      <Txt v="bodyL" align="center">
        {`Your ${noun} is now ${moneyWhole(value, currency)}.`}
      </Txt>
      <Txt v="bodyM" color="textMuted" align="center">
        {mode === "raise" ? `Your next raise is available from ${shortDate(resetsAt)}. You can lower it any time.` : "It applies now."}
      </Txt>
      <PracticeBadge />
    </View>
  );
}

const styles = StyleSheet.create({
  amount: { gap: space.xs, alignItems: "center", paddingTop: space.md },
  spacer: { flex: 1 },
  icon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  done: { alignItems: "center", gap: space.sm, paddingTop: space.xxxl },
});
