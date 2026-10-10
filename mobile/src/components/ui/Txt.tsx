import { Text, type TextProps, type TextStyle } from "react-native";
import { type, useTheme, type Palette, type TypeToken } from "@/theme";

type ColorKey = keyof Pick<Palette, "text" | "textMuted" | "accent" | "success" | "warning" | "danger" | "info" | "ink" | "onPrimary" | "onAccentFill">;

export interface TxtProps extends TextProps {
  v?: TypeToken;
  color?: ColorKey | (string & {});
  align?: TextStyle["textAlign"];
}

/** Text in the Vaultwise type scale. Body text scales with Dynamic Type; display sizes cap at ~1.3×. */
export function Txt({ v = "bodyL", color = "text", align, style, ...rest }: TxtProps) {
  const { c } = useTheme();
  const t = type[v];
  const resolved = (c as unknown as Record<string, string>)[color] ?? color;
  return (
    <Text
      maxFontSizeMultiplier={t.maxScale}
      {...rest}
      style={[
        { fontFamily: t.fontFamily, fontSize: t.fontSize, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing, color: resolved, textAlign: align },
        style,
      ]}
    />
  );
}
