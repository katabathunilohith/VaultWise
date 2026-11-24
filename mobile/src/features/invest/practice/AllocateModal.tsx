import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Amount, AmountKeypad, Banner, Button, ModalScreen, PracticeBadge, Stack, Txt } from "@/components/ui";
import { CheckRow } from "@/features/account/controls";
import { MpinPanel } from "@/features/mpin"; // mpin
import { api } from "@/lib/api/client";
import { mayHaveGoneThrough } from "@/lib/api/errors";
import { useDashboard } from "@/lib/api/hooks";
import { parseAmount } from "@/lib/money";
import { useSensitiveScreen } from "@/lib/screen-capture"; // protection
import { space } from "@/theme";
import { AmountDisplay } from "../core/AmountDisplay";
import { FlowModal } from "../core/FlowModal";
import { FlowDone, FlowError } from "../core/FlowParts";
import { fmtMoney } from "../format";
import { useInvalidateInvest } from "../use-invest";

/** mpin: every allocation asks for the MPIN on a step of its own (this flow is a React Native Modal, so no sheet route). */
type Step = "read" | "amount" | "review" | "mpin" | "done";

/**
 * The server's four risk disclosures (src/lib/invest/satellite.ts DISCLOSURES) in plain words, in the
 * same order. Shown only while the server sends exactly four; otherwise its own wording is shown, so
 * what's confirmed is always what the server counts.
 */
function plainDisclosures(capPct: number | null) {
  return [
    "It follows Smart Money Concepts, chart rules traders share online. There's no peer-reviewed evidence they give an edge after costs.",
    `It's opt-in${capPct ? ` and capped at ${capPct}% of your investments` : " and capped"}. It's kept apart from your vaults, and vault money is never used for trading.`,
    "Before it could ever use real money, it has to pass a test on past prices and then a practice period. Until then, what's set aside stays as cash.",
    "Crypto and currency prices swing a lot. You could lose some or all of what you set aside.",
  ];
}

/**
 * Turn Practice on, or set more aside for it (POST /invest/satellite/opt-in, the `satellite_opt_in`
 * money action): confirm each risk statement → amount (from the bank, up to the cap) → review →
 * MPIN → done. Every allocation needs every statement confirmed and the MPIN, as on the server.
 * An allocation that gets no answer may have gone through: it isn't offered again until the flow is
 * opened afresh. Mount with a fresh `key` on each open.
 */
export function AllocateModal({
  visible,
  onClose,
  onAskPerson,
  currency,
  optedIn,
  capPct,
  headroom,
  disclosures,
}: {
  visible: boolean;
  onClose: () => void;
  onAskPerson: () => void;
  currency: string;
  /** Already on: this sets more aside. */
  optedIn: boolean;
  capPct: number | null;
  /** What the cap still allows (minor units); null when the server didn't say. */
  headroom: number | null;
  /** The server's disclosures: their count is what it checks. */
  disclosures: string[];
}) {
  const dashboard = useDashboard();
  const invalidate = useInvalidateInvest();
  const statements = disclosures.length === 4 ? plainDisclosures(capPct) : disclosures;
  const [step, setStep] = useState<Step>("read");
  const [ack, setAck] = useState<boolean[]>(() => statements.map(() => false));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  /** No answer: it may have gone through, so it isn't offered again until the flow is opened afresh. */
  const [unconfirmed, setUnconfirmed] = useState(false);
  // protection: a money move with an MPIN pad inside the Invest tab (a Modal, not a route), so it blocks screenshots itself.
  useSensitiveScreen(visible);

  const amount = parseAmount(text);
  const bank = dashboard.data?.totals.bank ?? null;
  const overCap = amount !== null && headroom !== null && amount > headroom;
  const overBank = amount !== null && bank !== null && amount > bank;
  const allRead = statements.length > 0 && ack.every(Boolean);
  const title = optedIn ? "Set aside more" : "Turn on Practice";

  const back = (to: Step) => () => {
    setError(null);
    setStep(to);
  };
  const askPerson = () => {
    onClose();
    onAskPerson();
  };

  return (
    <FlowModal
      visible={visible}
      onRequestClose={busy ? () => {} : step === "mpin" ? back("review") : step === "review" ? back("amount") : step === "amount" ? back("read") : onClose}
    >
      {step === "mpin" && amount ? (
        <ModalScreen title={title} back={busy ? undefined : back("review")} hideLeading={busy} scroll={false}>
          <MpinPanel
            reason={`Set aside ${fmtMoney(amount, currency)} for Practice`}
            run={(pin) => api.satelliteOptIn(amount / 100, ack.filter(Boolean).length, pin)}
            onDone={() => {
              setStep("done");
              void invalidate();
            }}
            onError={(e) => {
              setError(e);
              // No answer: it may have moved, so the balances are read again.
              if (mayHaveGoneThrough(e)) {
                setUnconfirmed(true);
                void invalidate();
              }
              setStep("review");
            }}
            onBusy={setBusy}
          />
        </ModalScreen>
      ) : step === "done" ? (
        <ModalScreen onClose={onClose} scroll={false} footer={<Button key="done" label="Done" onPress={onClose} armOnMount />}>
          <FlowDone
            title={optedIn ? "Set aside." : "Practice is on."}
            body={`${amount ? fmtMoney(amount, currency) : "The money"} moved from your bank and stays as cash while the strategy practises.`}
          />
        </ModalScreen>
      ) : step === "review" && amount ? (
        <ModalScreen
          title={title}
          back={busy ? () => {} : back("amount")}
          footer={
            unconfirmed ? (
              <Button key="check" label="Check Practice" onPress={onClose} armOnMount />
            ) : (
              <Button key="set" label={`Set aside ${fmtMoney(amount, currency)}`} onPress={() => setStep("mpin")} loading={busy} armOnMount />
            )
          }
        >
          <PracticeBadge />
          <Stack gap={space.xxs}>
            <Txt v="labelM" color="textMuted">
              Setting aside for Practice
            </Txt>
            <Amount value={amount} currency={currency} size="l" animate={false} />
          </Stack>
          <Txt v="bodyM" color="textMuted">
            {`Moved from your bank and kept apart from your vaults. The strategy trades with virtual money; what you set aside stays as cash${
              capPct ? `, and Practice can never hold more than ${capPct}% of your investments` : ""
            }.`}
          </Txt>
          {unconfirmed ? (
            <Banner
              tone="warning"
              title="We couldn't confirm this"
              body="Vaultwise didn't answer in time, so the money may have moved. Check Practice before you set more aside."
            />
          ) : error ? (
            <FlowError error={error} nothingChanged="Nothing moved." onAskPerson={askPerson} />
          ) : null}
        </ModalScreen>
      ) : step === "amount" ? (
        <ModalScreen
          title={title}
          back={back("read")}
          scroll={false}
          footer={<Button key="review" label="Review" onPress={() => setStep("review")} disabled={!amount || overCap || overBank} armOnMount />}
        >
          <View style={styles.fill}>
            <ScrollView contentContainerStyle={styles.top} showsVerticalScrollIndicator={false}>
              <PracticeBadge />
              <Txt v="labelM" color="textMuted">
                How much to set aside
              </Txt>
              <AmountDisplay text={text} currency={currency} />
              {overCap && headroom !== null ? (
                <Banner
                  tone="warning"
                  title="That's over the cap"
                  body={`Practice can use at most ${capPct ?? 10}% of your investments, so up to ${fmtMoney(headroom, currency)} more.`}
                />
              ) : overBank && bank !== null ? (
                <Banner tone="warning" title="That's more than your bank has" body={`Your bank has ${fmtMoney(bank, currency)}.`} />
              ) : (
                <Txt v="bodyM" color="textMuted">
                  {`From your bank${headroom !== null ? `, up to ${fmtMoney(headroom, currency)}` : ""}.`}
                </Txt>
              )}
            </ScrollView>
            <AmountKeypad value={text} onChange={setText} />
          </View>
        </ModalScreen>
      ) : (
        <ModalScreen
          title={title}
          onClose={onClose}
          footer={<Button key="next" label="Continue" onPress={() => setStep("amount")} disabled={!allRead} armOnMount />}
        >
          <PracticeBadge />
          <Stack gap={space.xs}>
            <Txt v="headline" accessibilityRole="header">
              Before you set money aside
            </Txt>
            <Txt v="bodyL" color="textMuted">
              Confirm each one. You&apos;ll be asked every time you set more aside.
            </Txt>
          </Stack>
          <Stack gap={space.sm}>
            {statements.map((d, i) => (
              <CheckRow key={i} label={d} checked={ack[i] ?? false} onChange={(v) => setAck((a) => a.map((x, k) => (k === i ? v : x)))} />
            ))}
          </Stack>
        </ModalScreen>
      )}
    </FlowModal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, gap: space.md },
  top: { gap: space.sm },
});
