import { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { AmountKeypad, Banner, Button, ModalScreen, PracticeBadge, Txt } from "@/components/ui";
import { useLimits } from "@/lib/api/hooks";
import { haptic } from "@/lib/haptics";
import { parseAmount } from "@/lib/money";
import { space } from "@/theme";
import { AmountDisplay } from "../components/AmountDisplay";
import { amountText } from "../describe";
import type { FlowVault, StepNav } from "./types";

type Check = { tone: "danger" | "warning" | "info"; title: string; body?: string } | null;

/** Step 1: how much. The keypad sits in the lower middle, directly above Continue (R8, R1). */
export function AmountStep({
  nav,
  vault,
  value,
  onChange,
  onContinue,
}: {
  nav: StepNav;
  vault: FlowVault;
  value: string;
  onChange: (next: string) => void;
  onContinue: () => void;
}) {
  const limits = useLimits();
  const minor = parseAmount(value);
  const single = limits.data?.limits.singleWithdrawal ?? null;
  const dailyLeft = limits.data?.usage.dailyRemaining ?? null;
  const fmt = (m: number) => amountText(m, vault.currency);

  let check: Check = null;
  let valid = minor !== null;
  if (vault.available <= 0) {
    valid = false;
    check = {
      tone: "info",
      title: "Nothing available right now",
      body: vault.held > 0 ? `${fmt(vault.held)} is set aside for a request being checked.` : undefined,
    };
  } else if (minor !== null && minor > vault.available) {
    valid = false;
    check = { tone: "danger", title: "That's more than this vault has available", body: `${vault.name} has ${fmt(vault.available)} available.` };
  } else if (minor !== null && single !== null && minor > single) {
    valid = false;
    check = { tone: "danger", title: "That's over your limit for one withdrawal", body: `Your limit is ${fmt(single)}. You can change it in Settings.` };
  } else if (minor !== null && dailyLeft !== null && minor > dailyLeft) {
    valid = false;
    check = { tone: "danger", title: "That's more than you can take out today", body: `${fmt(dailyLeft)} left today.` };
  } else if (minor !== null && single !== null && minor >= single * 0.8) {
    check = { tone: "warning", title: "Close to your limit", body: `Your limit for one withdrawal is ${fmt(single)}.` };
  }

  // Warn once, on the frame the warning appears.
  const warned = useRef(false);
  const nearLimit = check?.tone === "warning";
  useEffect(() => {
    if (nearLimit && !warned.current) {
      warned.current = true;
      haptic("warning");
    }
  }, [nearLimit]);

  return (
    <ModalScreen
      title={`Withdraw · ${vault.name}`}
      onClose={nav.onClose}
      back={nav.onBack}
      scroll={false}
      footer={<Button label="Continue" armOnMount disabled={!valid} onPress={onContinue} />}
    >
      <View style={styles.fill}>
        <ScrollView contentContainerStyle={styles.top} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <PracticeBadge />
          <View style={styles.amount}>
            <AmountDisplay text={value} currency={vault.currency} />
          </View>
          <Txt v="bodyM" color="textMuted" align="center">
            Available {fmt(vault.available)}
            {single !== null ? ` · Limit ${fmt(single)}` : ""}
          </Txt>
          {check ? <Banner tone={check.tone} title={check.title} body={check.body} /> : null}
        </ScrollView>
        <AmountKeypad value={value} onChange={onChange} />
      </View>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, gap: space.md },
  top: { gap: space.sm },
  amount: { paddingTop: space.md, paddingHorizontal: space.xs },
});
