import { Text } from "react-native";
import { parseAmount, money } from "@/lib/money";
import { type, useTheme } from "@/theme";
import { fmtTyped } from "../format";

/** The amount being typed on the keypad, in the display face. Screen readers hear the full amount. */
export function AmountDisplay({ text, currency }: { text: string; currency: string }) {
  const { c } = useTheme();
  const parsed = parseAmount(text);
  const t = type.displayL;
  return (
    <Text
      accessibilityLabel={parsed ? money(parsed, currency) : "No amount entered"}
      accessibilityLiveRegion="polite"
      adjustsFontSizeToFit
      numberOfLines={1}
      maxFontSizeMultiplier={1.3}
      style={{ fontFamily: t.fontFamily, fontSize: t.fontSize, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing, color: text ? c.text : c.textMuted }}
    >
      {fmtTyped(text, currency)}
    </Text>
  );
}
