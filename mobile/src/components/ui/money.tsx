import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import { money, moneyParts, moneyWhole } from "@/lib/money";
import { fonts, type, useTheme } from "@/theme";
import { useReduceMotion } from "./hooks";

/**
 * Hero amount: display face, with the currency symbol and decimals at 55% size, top-aligned.
 * Changes count up over ≤600 ms (instant under Reduce Motion). Screen readers get the full amount.
 */
export function Amount({
  value,
  currency,
  size = "xl",
  color,
  animate = true,
  hideDecimals,
  align = "left",
}: {
  value: number;
  currency: string;
  size?: "xl" | "l" | "m";
  color?: string;
  animate?: boolean;
  hideDecimals?: boolean;
  align?: "left" | "center";
}) {
  const { c } = useTheme();
  const reduce = useReduceMotion();
  const shown = useCountUp(value, animate && !reduce);
  const p = moneyParts(shown, currency);
  const t = size === "xl" ? type.displayXL : size === "l" ? type.displayL : type.displayM;
  // iOS and Android shrink the text to fit (adjustsFontSizeToFit). The web preview can't, so it
  // scales from the measured width: ~0.6 em per digit/separator, symbol and decimals at 0.55 em.
  const [width, setWidth] = useState(0);
  const ems = (p.sign.length + p.whole.length) * 0.6 + (p.symbol.length + (!hideDecimals && p.fraction ? p.fraction.length + 1 : 0)) * 0.55 * 0.6;
  const fit = Platform.OS === "web" && width > 0 ? Math.min(1, width / (ems * t.fontSize)) : 1;
  const fontSize = Math.floor(t.fontSize * fit);
  const small = Math.round(fontSize * 0.55);
  const col = color ?? c.text;
  const base: TextStyle = { fontFamily: t.fontFamily, color: col, letterSpacing: t.letterSpacing * fit };
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={money(value, currency)}
      onLayout={Platform.OS === "web" ? (e) => setWidth(e.nativeEvent.layout.width) : undefined}
      style={[styles.row, align === "center" && { justifyContent: "center" }]}
    >
      <Text maxFontSizeMultiplier={1.3} adjustsFontSizeToFit numberOfLines={1} style={[base, { fontSize, lineHeight: Math.round(t.lineHeight * fit) }]}>
        {p.sign}
        <Text style={{ fontSize: small }}>{p.symbol}</Text>
        {p.whole}
        {!hideDecimals && p.fraction ? <Text style={{ fontSize: small, color: col }}>.{p.fraction}</Text> : null}
      </Text>
    </View>
  );
}

/** Inline amount in Geist Mono (rows, receipts, breakdowns) — digits never jitter. */
export function MoneyText({
  value,
  currency,
  v = "numM",
  color,
  signed,
  whole,
  style,
}: {
  value: number;
  currency: string;
  v?: "numXL" | "numL" | "numM" | "numS";
  color?: string;
  signed?: boolean;
  /** Drop ".00" on whole amounts (tight rows). */
  whole?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const { c } = useTheme();
  const t = type[v];
  const fmt = whole && value % 100 === 0 ? moneyWhole : money;
  const text = `${signed && value > 0 ? "+" : ""}${fmt(value, currency).replace("-", "−")}`;
  return (
    <Text
      maxFontSizeMultiplier={1.4}
      style={[{ fontFamily: t.fontFamily, fontSize: t.fontSize, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing, color: color ?? c.text }, style]}
    >
      {text}
    </Text>
  );
}

function useCountUp(target: number, animate: boolean) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (!animate || from.current === target) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = from.current;
    const t0 = Date.now();
    const dur = 600;
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (Date.now() - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(start + (target - start) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animate]);
  return shown;
}

const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "flex-start", alignSelf: "stretch" } });

export { fonts };
