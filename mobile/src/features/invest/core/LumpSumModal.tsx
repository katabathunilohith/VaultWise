import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Amount, AmountKeypad, Banner, Button, Card, Divider, ModalScreen, MoneyText, PracticeBadge, Stack, Txt } from "@/components/ui";
import { api } from "@/lib/api/client";
import { useConnection, useDashboard } from "@/lib/api/hooks";
import type { InvestCore } from "@/lib/api/types";
import { parseAmount } from "@/lib/money";
import { layout, space } from "@/theme";
import { recordDemoBuy } from "../demo-overlay";
import { fmtMoney, fmtWeight, splitByWeight } from "../format";
import { useInvalidateInvest } from "../use-invest";
import { AmountDisplay } from "./AmountDisplay";
import { FlowModal } from "./FlowModal";
import { FlowDone, FlowError } from "./FlowParts";

type Step = "amount" | "review" | "done";

/**
 * One-off buy into the model portfolio: amount → review the split → bought. Review, Buy and
 * Done all use the same main-button slot, each with its own `key` so the next step's button
 * mounts fresh and re-arms: a double tap on Review can't also press Buy. Mount with a fresh
 * `key` on each open.
 */
export function LumpSumModal({
  visible,
  onClose,
  onAskPerson,
  currency,
  bandName,
  allocations,
}: {
  visible: boolean;
  onClose: () => void;
  onAskPerson: () => void;
  currency: string;
  bandName: string;
  allocations: InvestCore["allocations"];
}) {
  const { mode } = useConnection();
  const dashboard = useDashboard();
  const invalidate = useInvalidateInvest();
  const [step, setStep] = useState<Step>("amount");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const amount = parseAmount(text);
  // A lump sum is paid from the bank balance. Checked here so people never get the ledger's
  // refusal; if the balance hasn't loaded, the server still has the final say.
  const bank = dashboard.data?.totals.bank ?? null;
  const overBank = amount !== null && bank !== null && amount > bank;

  const buy = async () => {
    if (!amount || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.buyCore(amount / 100);
      if (mode === "demo") recordDemoBuy(amount);
      setStep("done");
      void invalidate();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setError(null);
    setStep("amount");
  };

  const askPerson = () => {
    onClose();
    onAskPerson();
  };

  return (
    <FlowModal visible={visible} onRequestClose={busy ? () => {} : step === "review" ? back : onClose}>
      {step === "done" ? (
        <ModalScreen onClose={onClose} scroll={false} footer={<Button key="done" label="Done" onPress={onClose} armOnMount />}>
          <FlowDone
            title="Bought."
            body={amount ? `${fmtMoney(amount, currency)} went into your ${bandName} mix. It'll show in your holdings.` : "It'll show in your holdings."}
          />
        </ModalScreen>
      ) : step === "review" && amount ? (
        <ModalScreen
          title="Add lump sum"
          back={busy ? () => {} : back}
          footer={<Button key="buy" label={`Buy ${fmtMoney(amount, currency)}`} onPress={buy} loading={busy} armOnMount />}
        >
          <PracticeBadge />
          <Stack gap={space.xxs}>
            <Txt v="labelM" color="textMuted">
              {`You're investing in your ${bandName} mix`}
            </Txt>
            <Amount value={amount} currency={currency} size="l" animate={false} />
          </Stack>
          <Card>
            <Txt v="labelL" accessibilityRole="header">
              How it’s split
            </Txt>
            {splitByWeight(amount, allocations).map((s, i) => (
              <View key={s.symbol}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.splitRow} accessible accessibilityLabel={`${s.label}, ${fmtWeight(s.weight)}: ${fmtMoney(s.amount, currency)}`}>
                  <View style={{ flex: 1 }}>
                    <Txt v="bodyL">{s.label}</Txt>
                    <Txt v="caption" color="textMuted">
                      {fmtWeight(s.weight)}
                    </Txt>
                  </View>
                  <MoneyText value={s.amount} currency={currency} />
                </View>
              </View>
            ))}
          </Card>
          <Txt v="bodyM" color="textMuted">
            Paid from your bank and bought at today&apos;s prices, so the exact number of units can differ a little. In Practice mode this is
            simulated with real prices.
          </Txt>
          {error ? <FlowError error={error} nothingChanged="Nothing was bought." onAskPerson={askPerson} /> : null}
        </ModalScreen>
      ) : (
        <ModalScreen
          title="Add lump sum"
          onClose={onClose}
          scroll={false}
          footer={<Button key="review" label="Review" onPress={() => setStep("review")} disabled={!amount || overBank} armOnMount />}
        >
          <View style={styles.fill}>
            <ScrollView contentContainerStyle={styles.top} showsVerticalScrollIndicator={false}>
              <PracticeBadge />
              <Txt v="labelM" color="textMuted">
                How much to invest now
              </Txt>
              <AmountDisplay text={text} currency={currency} />
              {overBank && bank !== null ? (
                <Banner tone="warning" title="That's more than your bank has" body={`Your bank has ${fmtMoney(bank, currency)}.`} />
              ) : (
                <Txt v="bodyM" color="textMuted">
                  {`Paid from your bank${bank !== null ? ` (${fmtMoney(bank, currency)} there now)` : ""} and split across your ${bandName} mix at today's prices.`}
                </Txt>
              )}
            </ScrollView>
            <AmountKeypad value={text} onChange={setText} />
          </View>
        </ModalScreen>
      )}
    </FlowModal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, gap: space.md },
  top: { gap: space.sm },
  splitRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: layout.hit + 4, paddingVertical: space.xxs },
});
