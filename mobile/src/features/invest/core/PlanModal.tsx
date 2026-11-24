import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { AmountKeypad, Banner, Button, Chip, ModalScreen, PracticeBadge, Press, Stack, Txt } from "@/components/ui";
import { MPIN_ENABLED, MpinPanel, readMpinError } from "@/features/mpin"; // mpin
import { api } from "@/lib/api/client";
import { mayHaveGoneThrough } from "@/lib/api/errors";
import type { Minor } from "@/lib/api/types";
import { nextRunFrom, sipNeedsMpin } from "@/lib/invest";
import { parseAmount } from "@/lib/money";
import { useSensitiveScreen } from "@/lib/screen-capture"; // protection
import { layout, space } from "@/theme";
import { everyWord, fmtDay, fmtMoney, type Frequency } from "../format";
import { useInvalidateInvest } from "../use-invest";
import { AmountDisplay } from "./AmountDisplay";
import { FlowModal } from "./FlowModal";
import { FlowDone, FlowError } from "./FlowParts";

export interface CurrentPlan {
  amount: Minor;
  frequency: Frequency;
}

/** mpin: a plan that moves more money asks for the MPIN on a step of its own (this flow is a React Native Modal, so no sheet route). */
type Step = "edit" | "mpin" | "confirmStop" | "saved" | "stopped";

/**
 * Change (or start) the regular plan: frequency chips, amount keypad, Save in the main-button
 * slot. Each step's buttons have their own `key`, so they mount fresh and re-arm. Stopping lives in the header and is always confirmed; on the confirm step the safe
 * choice ("Keep my plan") holds the main slot and "Stop plan" sits above it.
 * mpin (`invest_sip`): starting a plan, or a change that takes more money per month, needs the MPIN
 * (sipNeedsMpin, the server's rule); lowering it or stopping it doesn't. A save that gets no answer
 * may have gone through, so it isn't offered again until the flow is opened afresh.
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
  const invalidate = useInvalidateInvest();
  // The plan as it was when the flow opened. The prop updates as soon as a save lands (the
  // refetch), which would otherwise flip "Plan started." to "Plan updated." mid-screen.
  const [plan] = useState(planAtOpen);
  const [step, setStep] = useState<Step>("edit");
  const [frequency, setFrequency] = useState<Frequency>(plan?.frequency ?? "monthly");
  const [text, setText] = useState(plan ? String(plan.amount / 100) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [savedNext, setSavedNext] = useState(0);
  /** The save got no answer and may have gone through: it isn't offered again until the flow is opened afresh. */
  const [unconfirmed, setUnconfirmed] = useState(false);
  // protection: an MPIN pad inside the Invest tab (a Modal, not a route of its own) blocks screenshots itself.
  useSensitiveScreen(visible && step === "mpin");

  const amount = parseAmount(text);
  const changed = !plan || amount !== plan.amount || frequency !== plan.frequency;

  const saved = () => {
    setSavedNext(nextRunFrom(frequency));
    setStep("saved");
    void invalidate();
  };

  const failed = (e: unknown) => {
    setError(e);
    // No answer: the plan may have changed, so it's read again and Save isn't offered twice.
    if (mayHaveGoneThrough(e)) {
      setUnconfirmed(true);
      void invalidate();
    }
    setStep("edit");
  };

  const save = async () => {
    if (!amount || busy || unconfirmed) return;
    setError(null);
    if (MPIN_ENABLED && sipNeedsMpin(plan, { amount, frequency })) {
      setStep("mpin");
      return;
    }
    setBusy(true);
    try {
      await api.setSip(amount / 100, frequency);
      saved();
    } catch (e) {
      // The server knows the plan better (say it changed on the web): if it wants the MPIN, ask for it.
      if (readMpinError(e)?.kind === "required") setStep("mpin");
      else failed(e);
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
    <FlowModal visible={visible} onRequestClose={busy ? () => {} : step === "confirmStop" || step === "mpin" ? backToEdit : onClose}>
      {step === "mpin" && amount ? (
        <ModalScreen title={plan ? "Change your plan" : "Start a plan"} back={busy ? undefined : backToEdit} hideLeading={busy} scroll={false}>
          <MpinPanel
            reason={`${plan ? "Change your plan to" : "Invest"} ${fmtMoney(amount, currency)} ${everyWord(frequency)} in your ${bandName} mix`}
            run={(pin) => api.setSip(amount / 100, frequency, pin)}
            onDone={saved}
            onError={failed}
            onBusy={setBusy}
          />
        </ModalScreen>
      ) : step === "edit" ? (
        <ModalScreen
          title={plan ? "Change your plan" : "Start a plan"}
          onClose={busy ? () => {} : onClose}
          scroll={false}
          headerRight={plan ? <StopLink disabled={busy} onPress={() => setStep("confirmStop")} /> : undefined}
          footer={
            unconfirmed ? (
              <Button key="check" label="Check your plan" onPress={onClose} armOnMount />
            ) : (
              <Button key="save" label={plan ? "Save plan" : "Start plan"} onPress={save} disabled={!amount || !changed} loading={busy} armOnMount />
            )
          }
        >
          <View style={styles.fill}>
            <ScrollView contentContainerStyle={styles.top} showsVerticalScrollIndicator={false}>
              <PracticeBadge />
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="How often">
                <Chip label="Weekly" selected={frequency === "weekly"} onPress={() => setFrequency("weekly")} />
                <Chip label="Monthly" selected={frequency === "monthly"} onPress={() => setFrequency("monthly")} />
              </View>
              <AmountDisplay text={text} currency={currency} />
              {unconfirmed ? (
                <Banner
                  tone="warning"
                  title="We couldn't confirm this change"
                  body="Vaultwise didn't answer in time, so your plan may have changed. Check your plan before you save it again."
                />
              ) : error ? (
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
