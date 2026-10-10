import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { AmountKeypad, Button, Chip, ModalScreen, PracticeBadge, Press, Stack, Txt } from "@/components/ui";
import { api } from "@/lib/api/client";
import { useConnection } from "@/lib/api/hooks";
import type { Minor } from "@/lib/api/types";
import { parseAmount } from "@/lib/money";
import { layout, space } from "@/theme";
import { recordDemoPlan } from "../demo-overlay";
import { everyWord, fmtDay, fmtMoney, nextRunFrom, type Frequency } from "../format";
import { useInvalidateInvest } from "../use-invest";
import { AmountDisplay } from "./AmountDisplay";
import { FlowModal } from "./FlowModal";
import { FlowDone, FlowError } from "./FlowParts";

export interface CurrentPlan {
  amount: Minor;
  frequency: Frequency;
}

type Step = "edit" | "confirmStop" | "saved" | "stopped";

/**
 * Change (or start) the regular plan: frequency chips, amount keypad, Save in the main-button
 * slot. Each step's buttons have their own `key`, so they mount fresh and re-arm. Stopping lives in the header and is always confirmed; on the confirm step the safe
 * choice ("Keep my plan") holds the main slot and "Stop plan" sits above it.
 * Mount with a fresh `key` on each open so every visit starts clean.
 */
export function PlanModal({
  visible,
  onClose,
  onAskPerson,
  currency,
  bandName,
  plan: planAtOpen,
}: {
  visible: boolean;
  onClose: () => void;
  onAskPerson: () => void;
  currency: string;
  bandName: string;
  plan: CurrentPlan | null;
}) {
  const { mode } = useConnection();
  const invalidate = useInvalidateInvest();
  // The plan as it was when the flow opened. The prop updates as soon as a save lands (refetch,
  // or the demo overlay), which would otherwise flip "Plan started." to "Plan updated." mid-screen.
  const [plan] = useState(planAtOpen);
  const [step, setStep] = useState<Step>("edit");
  const [frequency, setFrequency] = useState<Frequency>(plan?.frequency ?? "monthly");
  const [text, setText] = useState(plan ? String(plan.amount / 100) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [savedNext, setSavedNext] = useState(0);

  const amount = parseAmount(text);
  const changed = !plan || amount !== plan.amount || frequency !== plan.frequency;

  const save = async () => {
    if (!amount || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.setSip(amount / 100, frequency);
      const next = nextRunFrom(frequency);
      if (mode === "demo") recordDemoPlan({ amount, frequency, nextRunAt: next, active: true });
      setSavedNext(next);
      setStep("saved");
      void invalidate();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!plan || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelSip();
      if (mode === "demo") recordDemoPlan({ ...plan, nextRunAt: 0, active: false });
      setStep("stopped");
      void invalidate();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const backToEdit = () => {
    setError(null);
    setStep("edit");
  };

  const askPerson = () => {
    onClose();
    onAskPerson();
  };

  return (
    <FlowModal visible={visible} onRequestClose={busy ? () => {} : step === "confirmStop" ? backToEdit : onClose}>
      {step === "edit" ? (
        <ModalScreen
          title={plan ? "Change your plan" : "Start a plan"}
          onClose={busy ? () => {} : onClose}
          scroll={false}
          headerRight={plan ? <StopLink disabled={busy} onPress={() => setStep("confirmStop")} /> : undefined}
          footer={<Button key="save" label={plan ? "Save plan" : "Start plan"} onPress={save} disabled={!amount || !changed} loading={busy} armOnMount />}
        >
          <View style={styles.fill}>
            <ScrollView contentContainerStyle={styles.top} showsVerticalScrollIndicator={false}>
              <PracticeBadge />
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="How often">
                <Chip label="Weekly" selected={frequency === "weekly"} onPress={() => setFrequency("weekly")} />
                <Chip label="Monthly" selected={frequency === "monthly"} onPress={() => setFrequency("monthly")} />
              </View>
              <AmountDisplay text={text} currency={currency} />
              {error ? (
                <FlowError error={error} nothingChanged={plan ? "Your plan hasn't changed." : "No plan was started."} onAskPerson={askPerson} />
              ) : (
                <Txt v="bodyM" color="textMuted">
                  {amount
                    ? `${fmtMoney(amount, currency)} ${everyWord(frequency)} from your bank into your ${bandName} mix. Next buy ${fmtDay(nextRunFrom(frequency))}.`
                    : `Enter how much to invest ${everyWord(frequency)}.`}
                </Txt>
              )}
            </ScrollView>
            <AmountKeypad value={text} onChange={setText} />
          </View>
        </ModalScreen>
      ) : step === "confirmStop" ? (
        <ModalScreen
          title="Stop plan"
          back={busy ? () => {} : backToEdit}
          footer={
            <>
              <Button key="stop" label="Stop plan" variant="dangerOutline" size="md" onPress={stop} loading={busy} />
              <Button key="keep" label="Keep my plan" onPress={backToEdit} disabled={busy} armOnMount />
            </>
          }
        >
          <PracticeBadge />
          <Stack gap={space.xs}>
            <Txt v="headline" accessibilityRole="header">
              {`Stop your ${plan?.frequency ?? "monthly"} plan?`}
            </Txt>
            <Txt v="bodyL" color="textMuted">
              No more automatic buys from your bank. What you already hold stays invested, and you can start a plan again any time.
            </Txt>
          </Stack>
          {error ? <FlowError error={error} nothingChanged="Your plan is still on." onAskPerson={askPerson} /> : null}
        </ModalScreen>
      ) : (
        <ModalScreen onClose={onClose} scroll={false} footer={<Button key="done" label="Done" onPress={onClose} armOnMount />}>
          {step === "saved" && amount ? (
            <FlowDone title={plan ? "Plan updated." : "Plan started."} body={`${fmtMoney(amount, currency)} ${everyWord(frequency)}. Next buy ${fmtDay(savedNext)}.`} />
          ) : (
            <FlowDone title="Plan stopped." body="No more automatic buys. What you hold stays invested." />
          )}
        </ModalScreen>
      )}
    </FlowModal>
  );
}

/** Header-right "Stop plan": out of the thumb's easy path, as destructive actions should be. */
function StopLink({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <Press
      accessibilityLabel="Stop plan"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={[styles.stopLink, disabled && { opacity: 0.45 }]}
    >
      <Txt v="labelM" color="danger">
        Stop plan
      </Txt>
    </Press>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, gap: space.md },
  top: { gap: space.sm },
  chips: { flexDirection: "row", gap: space.xs },
  stopLink: { minHeight: layout.hit, justifyContent: "center", paddingHorizontal: 4 },
});
