import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { Button, Chip, ModalScreen, PracticeBadge, Txt } from "@/components/ui";
import type { WithdrawalRow } from "@/lib/api/types";
import { space } from "@/theme";
import { Field } from "../components/Field";
import { amountText } from "../describe";
import type { FlowVault, StepNav } from "./types";

const MAX_SAVED = 6;

/** Past payees from this vault, most recent first (one-tap reuse instead of retyping providers). */
export function savedPayees(rows: WithdrawalRow[] | undefined) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of [...(rows ?? [])].sort((a, b) => b.created_at - a.created_at)) {
    const p = r.payee?.trim();
    if (!p || seen.has(p.toLowerCase())) continue;
    seen.add(p.toLowerCase());
    out.push(p);
    if (out.length >= MAX_SAVED) break;
  }
  return out;
}

/** Step 2: who is being paid, plus an optional note. */
export function PayeeStep({
  nav,
  vault,
  amount,
  saved,
  payee,
  note,
  onPayee,
  onNote,
  onContinue,
}: {
  nav: StepNav;
  vault: FlowVault;
  amount: number;
  saved: string[];
  payee: string;
  note: string;
  onPayee: (v: string) => void;
  onNote: (v: string) => void;
  onContinue: () => void;
}) {
  const valid = payee.trim().length >= 2;
  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "web" ? undefined : "padding"}>
      <ModalScreen
        title={`Withdraw · ${vault.name}`}
        onClose={nav.onClose}
        back={nav.onBack}
        footer={<Button label="Continue" armOnMount disabled={!valid} onPress={onContinue} />}
      >
        <PracticeBadge />
        <View style={{ gap: space.xs }}>
          <Txt v="headline" accessibilityRole="header">
            Who are you paying?
          </Txt>
          <Txt v="bodyM" color="textMuted">
            {amountText(amount, vault.currency)} from {vault.name}. Use the name on the bill.
          </Txt>
        </View>
        <Field
          label="Payee"
          value={payee}
          onChangeText={onPayee}
          placeholder="For example, City General Hospital"
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus={!payee && saved.length === 0}
          returnKeyType="next"
          maxLength={120}
          textContentType="organizationName"
        />
        {saved.length ? (
          <View style={{ gap: space.xs }}>
            <Txt v="labelM" color="textMuted">
              Paid before from {vault.name}
            </Txt>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {saved.map((p) => (
                <Chip key={p} label={p} selected={payee.trim() === p} onPress={() => onPayee(p)} />
              ))}
            </View>
          </View>
        ) : null}
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={onNote}
          placeholder="What it's for, like a follow-up visit"
          maxLength={200}
          returnKeyType="done"
        />
      </ModalScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
});
