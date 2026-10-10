import { View } from "react-native";
import { Txt } from "@/components/ui";
import type { Minor } from "@/lib/api/types";
import { money } from "@/lib/money";
import { useTheme } from "@/theme";
import { fmtAbs, fmtPct } from "./format";

/**
 * Profit or loss, never by colour alone: a ▲/▼ glyph, a +/− sign and the theme's gain/loss
 * colour (which follows the colour-blind setting). `muted` drops the colour for Practice,
 * where nothing should flash red or green.
 */
export function Pnl({
  value,
  currency,
  base,
  suffix,
  size = "row",
  muted,
}: {
  value: Minor;
  currency: string;
  /** What the change is measured against (cost); adds "(3.7%)" when > 0. */
  base?: Minor;
  suffix?: string;
  size?: "hero" | "row";
  muted?: boolean;
}) {
  const { gain, loss, c } = useTheme();
  const up = value > 0;
  const down = value < 0;
  const color = muted || (!up && !down) ? c.textMuted : up ? gain : loss;
  const glyph = up ? "▲" : down ? "▼" : "";
  const sign = up ? "+" : down ? "−" : "";
  const pct = base && base > 0 ? fmtPct(value / base) : null;
  const text = up || down ? `${glyph} ${sign}${fmtAbs(value, currency)}${pct ? ` (${sign}${pct})` : ""}` : `No change`;
  const spoken = `${up ? "Up" : down ? "Down" : "No change"}${up || down ? ` ${money(Math.abs(value), currency)}` : ""}${pct ? `, ${pct}` : ""}${suffix ? `, ${suffix}` : ""}`;
  return (
    <View accessible accessibilityLabel={spoken} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 6 }}>
      <Txt v={size === "hero" ? "numL" : "numS"} color={color}>
        {text}
      </Txt>
      {suffix ? (
        <Txt v={size === "hero" ? "bodyM" : "caption"} color="textMuted">
          {suffix}
        </Txt>
      ) : null}
    </View>
  );
}
