import { Text } from "react-native";
import { currencySymbol, money, moneyParts, parseAmount } from "@/lib/money";
import { type, useTheme } from "@/theme";

/**
 * The amount being typed on the keypad, as a hero number: display face, symbol and decimals at
 * 55%, shrinking to fit one line. Shows exactly what was typed (including a trailing ".").
 */
export function AmountDisplay({ text, currency }: { text: string; currency: string }) {
  const { c } = useTheme();
  const [int = "", dec] = text.split(".");
  const whole = moneyParts(Number(int || "0") * 100, currency).whole || "0";
  const symbol = currencySymbol(currency);
  const chars = symbol.length + whole.length + (dec !== undefined ? dec.length + 1 : 0);
  // adjustsFontSizeToFit isn't available on web, so step the size down by length as well.
  const t = type.displayXL;
  const size = chars > 12 ? 36 : chars > 10 ? 42 : chars > 8 ? 48 : t.fontSize;
  const small = Math.round(size * 0.55);
  const minor = parseAmount(text);
  return (
    <Text
      accessibilityRole="text"
      accessibilityLabel={minor ? money(minor, currency) : `${symbol}0`}
      accessibilityLiveRegion="polite"
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.5}
      maxFontSizeMultiplier={1.3}
      style={{
        fontFamily: t.fontFamily,
        fontSize: size,
        lineHeight: Math.round(size * 1.08),
        letterSpacing: t.letterSpacing,
        color: text ? c.text : c.textMuted,
        textAlign: "center",
      }}
    >
      <Text style={{ fontSize: small }}>{symbol}</Text>
      {whole}
      {dec !== undefined ? <Text style={{ fontSize: small }}>.{dec}</Text> : null}
    </Text>
  );
}
