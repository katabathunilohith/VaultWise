import { useState } from "react";
import { BankIcon, WalletIcon } from "@/components/icons";
import { Amount, Banner, Button, Card, Divider, ModalScreen, PracticeBadge, Txt, useHardwareBack } from "@/components/ui";
import { KeypadFooter, TypedAmount } from "@/features/vaults/fields";
import { api } from "@/lib/api/client";
import { useInvalidateMoney } from "@/lib/api/hooks";
import type { Wallet } from "@/lib/api/wallet-types";
import { haptic } from "@/lib/haptics";
import { parseAmount } from "@/lib/money";
import { amountText, limitLeft, moveUnconfirmed, outgoingProblem } from "../model";
import { CheckWalletButton, DoneScreen, FlowLine, MoveFailed, PlaceCard, toWallet, useMoveFailure } from "./parts";

type Step = "amount" | "confirm" | "done";

/** Cash out: wallet → your bank. Counts toward the daily limit. Works even while the wallet is switched off. */
export function CashOutFlow({ wallet }: { wallet: Wallet }) {
  const invalidate = useInvalidateMoney();
  const failed = useMoveFailure();
  const [step, setStep] = useState<Step>("amount");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [after, setAfter] = useState<number | null>(null);

  const cur = wallet.currency;
  const minor = parseAmount(value) ?? 0;
  const problem = outgoingProblem(minor, wallet, true);
  const left = limitLeft(wallet);
  // No answer came: the money may have moved, so the way on is the wallet, not this move again.
  const unsure = moveUnconfirmed(error);

  useHardwareBack(submitting ? "block" : unsure ? toWallet : step === "confirm" ? () => setStep("amount") : null);

  const type = (next: string) => {
    if (outgoingProblem(parseAmount(next), wallet, true) && !problem) haptic("warning");
    setValue(next);
  };

  const submit = async () => {
    if (!minor || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.walletCashOut(minor / 100);
      // Money out: the plain commit haptic, no celebration.
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

  if (step === "done")
    return <DoneScreen title="Cash out" heading="Moved to your bank" body={`${amountText(minor, cur)} has left your wallet for your bank.`} balance={after} currency={cur} />;

  if (step === "confirm")
    return (
      <ModalScreen
        title="Cash out"
        onClose={unsure ? toWallet : undefined}
        back={
          unsure
            ? undefined
            : () => {
                if (!submitting) setStep("amount");
              }
        }
        footer={
          unsure ? (
            <CheckWalletButton />
          ) : (
            <Button key="confirm" label={`Move ${amountText(minor, cur)} to your bank`} onPress={() => void submit()} loading={submitting} armOnMount />
          )
        }
      >
        <PracticeBadge />
        <Txt v="titleM" color="textMuted" align="center" accessibilityRole="header">
          You&apos;re moving to your bank
        </Txt>
        <Amount value={minor} currency={cur} size="xl" align="center" animate={false} />
        {error ? <MoveFailed error={error} /> : null}
        <Card>
          <FlowLine label="From" value="Your wallet" />
          <Divider />
          <FlowLine label="To" value="Your bank" />
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
          Cashing out counts toward your daily limit, like a payment.
        </Txt>
      </ModalScreen>
    );

  return (
    <ModalScreen
      title="Cash out"
      footer={
        <KeypadFooter
          stepKey="amount"
          value={value}
          onChange={type}
          label="Continue"
          disabled={!minor || !!problem}
          onPress={() => {
            setError(null);
            setStep("confirm");
          }}
        />
      }
    >
      <PracticeBadge />
      <PlaceCard
        icon={WalletIcon}
        title="From your wallet"
        line={[`${amountText(wallet.balance, cur)} there now`, left !== null ? `${amountText(left, cur)} left today under your limit` : null].filter(Boolean).join(" · ")}
      />
      <TypedAmount value={value} currency={cur} caption="Move to your bank" />
      <PlaceCard icon={BankIcon} title="To your bank" line={null} />
      {problem ? <Banner tone="warning" title={problem.title} body={problem.body} /> : null}
    </ModalScreen>
  );
}
