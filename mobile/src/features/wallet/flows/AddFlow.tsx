import { useState } from "react";
import { BankIcon, WalletIcon } from "@/components/icons";
import { Amount, Banner, Button, Card, Divider, ModalScreen, PracticeBadge, Txt, useHardwareBack } from "@/components/ui";
import { KeypadFooter, TypedAmount } from "@/features/vaults/fields";
import { api } from "@/lib/api/client";
import { useInvalidateMoney } from "@/lib/api/hooks";
import type { Wallet } from "@/lib/api/wallet-types";
import { haptic } from "@/lib/haptics";
import { parseAmount } from "@/lib/money";
import { amountText, moveUnconfirmed } from "../model";
import { CheckWalletButton, DoneScreen, FlowLine, MoveFailed, PlaceCard, toWallet, useMoveFailure } from "./parts";

type Step = "amount" | "confirm" | "done";

/** Add money: bank → wallet. Amount on the keypad (R8), confirm, done. */
export function AddFlow({ wallet }: { wallet: Wallet }) {
  const invalidate = useInvalidateMoney();
  const failed = useMoveFailure();
  const [step, setStep] = useState<Step>("amount");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [after, setAfter] = useState<number | null>(null);

  const cur = wallet.currency;
  const bank = wallet.bankBalance ?? null;
  const minor = parseAmount(value) ?? 0;
  const overBank = bank !== null && minor > bank;
  // No answer came: the money may have moved, so the way on is the wallet, not this move again.
  const unsure = moveUnconfirmed(error);

  useHardwareBack(submitting ? "block" : unsure ? toWallet : step === "confirm" ? () => setStep("amount") : null);

  const type = (next: string) => {
    const n = parseAmount(next) ?? 0;
    // A safety stop engaged: say so once, as it's crossed, not on every key.
    if (bank !== null && n > bank && !overBank) haptic("warning");
    setValue(next);
  };

  const submit = async () => {
    if (!minor || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.walletTopUp(minor / 100);
      setAfter(res?.wallet?.balance ?? wallet.balance + minor);
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
    return <DoneScreen title="Add money" heading="Added" body={`${amountText(minor, cur)} is in your wallet.`} balance={after} currency={cur} />;

  if (step === "confirm")
    return (
      <ModalScreen
        title="Add money"
        onClose={unsure ? toWallet : undefined}
        back={
          unsure
            ? undefined
            : () => {
                if (!submitting) setStep("amount");
              }
        }
        footer={unsure ? <CheckWalletButton /> : <Button key="confirm" label={`Add ${amountText(minor, cur)}`} onPress={() => void submit()} loading={submitting} armOnMount />}
      >
        <PracticeBadge />
        <Txt v="titleM" color="textMuted" align="center" accessibilityRole="header">
          You&apos;re adding
        </Txt>
        <Amount value={minor} currency={cur} size="xl" align="center" animate={false} />
        {error ? <MoveFailed error={error} /> : null}
        <Card>
          <FlowLine label="From" value="Your bank" />
          <Divider />
          <FlowLine label="To" value="Your wallet" />
          <Divider />
          <FlowLine label="Wallet after this" value={amountText(wallet.balance + minor, cur)} />
        </Card>
        <Txt v="bodyM" color="textMuted">
          Wallet money is yours to spend. It isn&apos;t locked like money in a vault.
        </Txt>
      </ModalScreen>
    );

  return (
    <ModalScreen
      title="Add money"
      footer={
        <KeypadFooter
          stepKey="amount"
          value={value}
          onChange={type}
          label="Continue"
          disabled={!minor || overBank}
          onPress={() => {
            setError(null);
            setStep("confirm");
          }}
        />
      }
    >
      <PracticeBadge />
      <PlaceCard icon={WalletIcon} title="Into your wallet" line={`${amountText(wallet.balance, cur)} there now`} />
      <TypedAmount value={value} currency={cur} caption="Add to your wallet" />
      <PlaceCard icon={BankIcon} title="From your bank" line={bank !== null ? `${amountText(bank, cur)} available` : null} />
      {overBank && bank !== null ? (
        <Banner tone="warning" title="More than your bank has" body={`Your bank has ${amountText(bank, cur)}. Try a smaller amount.`} />
      ) : null}
      <Txt v="caption" color="textMuted">
        It lands in your wallet straight away.
      </Txt>
    </ModalScreen>
  );
}
