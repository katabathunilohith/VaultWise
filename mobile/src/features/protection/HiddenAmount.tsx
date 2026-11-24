import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { EyeIcon, EyeSlashIcon } from "@/components/icons";
import { Amount, MoneyText, Press } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { currencySymbol } from "@/lib/money";
import { type, useTheme } from "@/theme";
import { peekBalances, setHideBalances, useBalancesMasked, useHideBalances } from "./balances";
import { PEEK_MS, PROTECTION } from "./config";

/** What a hidden amount shows in place of its digits. */
export const MASK = "••••";

/** "₹••••": a hidden amount in text. */
export const maskedMoney = (currency: string) => `${currencySymbol(currency)}${MASK}`;

const SPOKEN_HIDDEN = "Amount hidden";

/**
 * A hero amount (the kit's Amount) that shows dots while "Hide balances" is on. With `tapToShow`,
 * a tap on the dots shows every hidden amount for a short while (leave it off inside a card that
 * is already a button).
 */
export function MaskedAmount({ tapToShow, ...props }: ComponentProps<typeof Amount> & { tapToShow?: boolean }) {
  const { c } = useTheme();
  const masked = useBalancesMasked();
  if (!masked) return <Amount {...props} />;
  const t = props.size === "l" ? type.displayL : props.size === "m" ? type.displayM : type.displayXL;
  const small = Math.round(t.fontSize * 0.55);
  const dots = (
    <View style={[styles.row, props.align === "center" && styles.center]}>
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={{ fontFamily: t.fontFamily, fontSize: t.fontSize, lineHeight: t.lineHeight, color: props.color ?? c.text }}>
        <Text style={{ fontSize: small }}>{currencySymbol(props.currency)}</Text>
        {MASK}
      </Text>
    </View>
  );
  if (!tapToShow)
    return (
      <View accessible accessibilityRole="text" accessibilityLabel={SPOKEN_HIDDEN}>
        {dots}
      </View>
    );
  return (
    <Press onPress={peekBalances} scaleTo={0.98} accessibilityLabel={SPOKEN_HIDDEN} accessibilityHint={`Shows your balances for ${Math.round(PEEK_MS / 1000)} seconds`}>
      {dots}
    </Press>
  );
}

/** An inline amount (the kit's MoneyText) that shows dots while "Hide balances" is on. */
export function MaskedMoneyText(props: ComponentProps<typeof MoneyText>) {
  const { c } = useTheme();
  const masked = useBalancesMasked();
  if (!masked) return <MoneyText {...props} />;
  const t = type[props.v ?? "numM"];
  return (
    <Text
      accessibilityLabel={SPOKEN_HIDDEN}
      maxFontSizeMultiplier={1.4}
      style={[{ fontFamily: t.fontFamily, fontSize: t.fontSize, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing, color: props.color ?? c.text }, props.style]}
    >
      {maskedMoney(props.currency)}
    </Text>
  );
}

/** The eye next to Home's balance: hides or shows amounts on Home. */
export function HideBalancesButton() {
  const { c } = useTheme();
  const hidden = useHideBalances();
  if (!PROTECTION.hideBalances) return null;
  const Icon = hidden ? EyeSlashIcon : EyeIcon;
  return (
    <Press
      onPress={() => {
        haptic(hidden ? "toggle.off" : "toggle.on");
        void setHideBalances(!hidden);
      }}
      hitSlop={10}
      accessibilityRole="switch"
      accessibilityState={{ checked: hidden }}
      accessibilityLabel="Hide balances"
      accessibilityHint={hidden ? "Shows the amounts on Home" : "Hides the amounts on Home until you tap them"}
      style={styles.eye}
    >
      <Icon size={20} color={c.textMuted} weight="bold" />
    </Press>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", alignSelf: "stretch" },
  center: { justifyContent: "center" },
  eye: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
