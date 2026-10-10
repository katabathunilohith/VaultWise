import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircleIcon, LockIcon, XIcon } from "@/components/icons";
import { MoneyText, Press, Row, Txt, VaultGlyph } from "@/components/ui";
import type { PaymentIntent } from "@/lib/api/pay-types";
import { money } from "@/lib/money";
import { layout, radius, space, useTheme } from "@/theme";
import { payAmount } from "../format";
import { billWord, type VaultOption } from "./vaults";

/**
 * Choose which vault pays. Vaults that can't pay this bill stay in the list, disabled, with the
 * reason — so it's clear why, instead of them silently missing.
 */
export function VaultPicker({
  visible,
  intent,
  options,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  intent: PaymentIntent;
  options: VaultOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close vault list" />
        <View style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.border, paddingBottom: insets.bottom + space.md }]} accessibilityViewIsModal>
          <Row style={styles.head}>
            <Txt v="titleL" accessibilityRole="header" style={styles.flex}>
              Pay from
            </Txt>
            <Press accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={[styles.close, { backgroundColor: c.surfaceRaised }]}>
              <XIcon size={20} color={c.text} weight="bold" />
            </Press>
          </Row>
          <Txt v="bodyM" color="textMuted">
            Only vaults that cover {billWord(intent.category)} bills and have {payAmount(intent.amount, intent.currency)} available can pay this.
          </Txt>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} accessibilityRole="radiogroup">
            {options.map((o) => (
              <Option
                key={o.id}
                option={o}
                currency={intent.currency}
                selected={o.id === selectedId}
                onPress={() => {
                  onSelect(o.id);
                  onClose();
                }}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Option({ option, currency, selected, onPress }: { option: VaultOption; currency: string; selected: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const disabled = !!option.disabledReason;
  return (
    <Press
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${option.name}, ${money(option.available, currency)} available${option.disabledReason ? `. ${option.disabledReason}` : ""}`}
      hapticOnPressIn={disabled || selected ? null : "select.tick"}
      scaleTo={0.99}
      onPress={onPress}
      style={[
        styles.option,
        {
          backgroundColor: selected ? c.accentSoft : c.surfaceRaised,
          borderColor: selected ? c.accent : c.border,
        },
      ]}
    >
      <VaultGlyph category={option.category} size={40} />
      <View style={styles.flex}>
        <Txt v="labelL" color={disabled ? "textMuted" : "text"} numberOfLines={2}>
          {option.name}
        </Txt>
        <Row gap={4}>
          <MoneyText v="numS" value={option.available} currency={currency} color={c.textMuted} />
          <Txt v="caption" color="textMuted">
            available
          </Txt>
        </Row>
        {option.disabledReason ? (
          <Row gap={4}>
            <LockIcon size={14} color={c.textMuted} weight="bold" />
            <Txt v="caption" color="textMuted" style={styles.flex}>
              {option.disabledReason}
            </Txt>
          </Row>
        ) : null}
      </View>
      {selected ? <CheckCircleIcon size={24} color={c.accent} weight="fill" /> : null}
    </Press>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
    gap: space.sm,
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
    maxHeight: "80%",
  },
  head: { minHeight: layout.hit },
  close: { width: layout.hit, height: layout.hit, borderRadius: layout.hit / 2, alignItems: "center", justifyContent: "center" },
  list: { flexGrow: 0 },
  listContent: { gap: space.xs, paddingBottom: space.xs },
  option: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  flex: { flex: 1 },
});
