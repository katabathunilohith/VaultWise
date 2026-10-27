import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { WalletIcon } from "@/components/icons";
import { Amount, Banner, Button, Card, Chip, Divider, HoldToConfirm, ModalScreen, PracticeBadge, TextField, Txt, useHardwareBack } from "@/components/ui";
import { KeypadFooter, TypedAmount } from "@/features/vaults/fields";
import { api } from "@/lib/api/client";
import { useInvalidateMoney } from "@/lib/api/hooks";
import { WALLET_NOTE_MAX, WALLET_PAYEE_MAX, type Wallet } from "@/lib/api/wallet-types";
import { haptic } from "@/lib/haptics";
import { parseAmount } from "@/lib/money";
import { space } from "@/theme";
import { amountText, limitLeft, moveUnconfirmed, outgoingProblem, recentPayees } from "../model";
import { CheckWalletButton, closeFlow, DoneScreen, FlowLine, MoveFailed, PlaceCard, toWallet, useMoveFailure } from "./parts";

type Step = "payee" | "amount" | "review" | "done";

/**
 * Pay someone from the wallet: who → how much → review, then press and hold to pay (deliberate
 * friction for money going out, like checkout). Counts toward the daily limit. No celebration:
 * the commit haptic plays once the payment is made.
 */
export function SpendFlow({ wallet }: { wallet: Wallet }) {
  const invalidate = useInvalidateMoney();
  const failed = useMoveFailure();
  const [step, setStep] = useState<Step>("payee");
  const [payee, setPayee] = useState("");
  const [note, setNote] = useState("");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [after, setAfter] = useState<number | null>(null);

  const cur = wallet.currency;
  const minor = parseAmount(value) ?? 0;
  const problem = outgoingProblem(minor, wallet, true);
  const name = payee.trim();
  const saved = recentPayees(wallet);
  const left = limitLeft(wallet);

  // No answer came: the money may have moved, so the way on is the wallet, not this payment again.
  const unsure = moveUnconfirmed(error);

  useHardwareBack(submitting ? "block" : unsure ? toWallet : step === "review" ? () => setStep("amount") : step === "amount" ? () => setStep("payee") : null);

  const type = (next: string) => {
    if (outgoingProblem(parseAmount(next), wallet, true) && !problem) haptic("warning");
    setValue(next);
  };

  const pay = async () => {
    if (!minor || submitting || problem) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.walletSpend(minor / 100, name, note.trim() || null);
      // The money has gone: the commit haptic plays now, never a celebration.
      haptic("irreversible.commit");
      setAfter(res?.wallet?.balance ?? wallet.balance - minor);
      setStep("done");
      void invalidate();
    } catch (e) {
      failed(e);
      setError(e);
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "done") return <DoneScreen title="Pay someone" heading="Paid" body={`${amountText(minor, cur)} to ${name}.`} balance={after} currency={cur} />;

  if (step === "review")
    return (
      <ModalScreen
        title="Pay someone"
        onClose={unsure ? toWallet : undefined}
        back={
          unsure
            ? undefined
            : () => {
                if (!submitting) setStep("amount");
              }
        }
        hideLeading={submitting}
        footer={
          submitting ? (
            <Button label="Paying" loading />
          ) : unsure ? (
            <CheckWalletButton />
          ) : (
            <HoldToConfirm label={`Hold to pay ${amountText(minor, cur)}`} onConfirm={() => void pay()} disabled={!!problem} commitHaptic={false} />
          )
        }
      >
        <PracticeBadge />
        <Txt v="titleM" color="textMuted" align="center" accessibilityRole="header">
          You&apos;re paying
        </Txt>
        <Amount value={minor} currency={cur} size="xl" align="center" animate={false} />
        {error ? <MoveFailed error={error} /> : problem ? <Banner tone="warning" title={problem.title} body={problem.body} /> : null}
        <Card>
          <FlowLine label="To" value={name} />
          {note.trim() ? (
            <>
              <Divider />
              <FlowLine label="Note" value={note.trim()} />
            </>
          ) : null}
          <Divider />
          <FlowLine label="From" value="Your wallet" />
          <Divider />
          <FlowLine label="Wallet after this" value={amountText(Math.max(0, wallet.balance - minor), cur)} />
          {left !== null ? (
            <>
              <Divider />
              <FlowLine label="Left today under your limit" value={amountText(Math.max(0, left - minor), cur)} />
            </>
          ) : null}
        </Card>
        <Txt v="bodyM" color="textMuted">
          A payment can&apos;t be taken back once it&apos;s made. Check the name before you hold.
        </Txt>
      </ModalScreen>
    );

  if (step === "amount")
    return (
      <ModalScreen
        title="Pay someone"
        back={() => setStep("payee")}
        footer={
          <KeypadFooter
            stepKey="amount"
            value={value}
            onChange={type}
            label="Continue"
            disabled={!minor || !!problem}
            onPress={() => {
              setError(null);
              setStep("review");
            }}
          />
        }
      >
        <PracticeBadge />
        <TypedAmount value={value} currency={cur} caption={`Pay ${name}`} />
        <PlaceCard
          icon={WalletIcon}
          title="From your wallet"
          line={[`${amountText(wallet.balance, cur)} there now`, left !== null ? `${amountText(left, cur)} left today under your limit` : null].filter(Boolean).join(" · ")}
        />
        {problem ? <Banner tone="warning" title={problem.title} body={problem.body} /> : null}
      </ModalScreen>
    );

  const valid = name.length >= 2;
  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "web" ? undefined : "padding"}>
      <ModalScreen title="Pay someone" onClose={closeFlow} footer={<Button key="payee" label="Continue" armOnMount disabled={!valid} onPress={() => setStep("amount")} />}>
        <PracticeBadge />
        <View style={styles.intro}>
          <Txt v="headline" accessibilityRole="header">
            Who are you paying?
          </Txt>
          <Txt v="bodyM" color="textMuted">
            A person or a shop. It comes out of your wallet, not your vaults.
          </Txt>
        </View>
        <TextField
          label="Pay to"
          value={payee}
          onChangeText={setPayee}
          placeholder="For example, Corner Café"
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus={!payee && saved.length === 0}
          returnKeyType="next"
          maxLength={WALLET_PAYEE_MAX}
        />
        {saved.length ? (
          <View style={styles.intro}>
            <Txt v="labelM" color="textMuted">
              Paid before
            </Txt>
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Paid before">
              {saved.map((p) => (
                <Chip key={p} label={p} selected={name === p} onPress={() => setPayee(p)} />
              ))}
            </View>
          </View>
        ) : null}
        <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="What it's for" maxLength={WALLET_NOTE_MAX} returnKeyType="done" />
      </ModalScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  intro: { gap: space.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
});
