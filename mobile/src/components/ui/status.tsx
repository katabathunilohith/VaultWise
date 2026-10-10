import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import {
  CheckCircleIcon,
  ClockIcon,
  InfoIcon,
  WarningCircleIcon,
  XCircleIcon,
  type Icon,
} from "@/components/icons";
import { categoryOf } from "@/lib/categories";
import { radius, useTheme, type Palette } from "@/theme";
import { Press } from "./Press";
import { Txt } from "./Txt";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";

export function toneColors(c: Palette, tone: Tone) {
  switch (tone) {
    case "success":
      return { fg: c.success, bg: c.successSoft };
    case "warning":
      return { fg: c.warning, bg: c.warningSoft };
    case "danger":
      return { fg: c.danger, bg: c.dangerSoft };
    case "info":
      return { fg: c.info, bg: c.infoSoft };
    case "accent":
      return { fg: c.accent, bg: c.accentSoft };
    default:
      return { fg: c.textMuted, bg: c.surfaceRaised };
  }
}

const TONE_ICON: Record<Tone, Icon> = {
  success: CheckCircleIcon,
  warning: WarningCircleIcon,
  danger: XCircleIcon,
  info: InfoIcon,
  neutral: ClockIcon,
  accent: InfoIcon,
};

/** Status always carries an icon and a word — never colour alone (WCAG 1.4.1). */
export function StatusPill({ tone, label, icon }: { tone: Tone; label: string; icon?: Icon }) {
  const { c } = useTheme();
  const col = toneColors(c, tone);
  const IconCmp = icon ?? TONE_ICON[tone];
  return (
    <View style={[styles.pill, { backgroundColor: col.bg }]} accessibilityLabel={label}>
      <IconCmp size={14} color={col.fg} weight="bold" />
      <Txt v="caption" color={tone === "neutral" ? "textMuted" : col.fg}>
        {label}
      </Txt>
    </View>
  );
}

/** Banner for warnings and errors: icon + title in the status colour, body in text colour. */
export function Banner({ tone, title, body, icon, action }: { tone: Tone; title: string; body?: string; icon?: Icon; action?: { label: string; onPress: () => void } }) {
  const { c } = useTheme();
  const col = toneColors(c, tone);
  const IconCmp = icon ?? TONE_ICON[tone];
  return (
    <View style={[styles.banner, { backgroundColor: col.bg }]} accessibilityRole="summary">
      <IconCmp size={22} color={col.fg} weight="fill" />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="labelL" color={tone === "neutral" ? "text" : col.fg}>
          {title}
        </Txt>
        {body ? (
          <Txt v="bodyM" color="text">
            {body}
          </Txt>
        ) : null}
        {action ? (
          <Press onPress={action.onPress} accessibilityLabel={action.label} hitSlop={10} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
            <Txt v="labelM" color={tone === "neutral" ? "accent" : col.fg}>
              {action.label}
            </Txt>
          </Press>
        ) : null}
      </View>
    </View>
  );
}

/** Store requirement: simulated money must never look real. Shown on every money screen. */
export function PracticeBadge({ compact }: { compact?: boolean }) {
  const { c } = useTheme();
  return (
    <View accessible style={[styles.practice, { backgroundColor: c.practice }]} accessibilityLabel="Practice mode, no real money">
      <View style={[styles.dot, { backgroundColor: c.accentFill }]} />
      <Txt v="micro" color={c.onPractice}>
        {compact ? "PRACTICE" : "PRACTICE · NO REAL MONEY"}
      </Txt>
    </View>
  );
}

/** Vault category glyph: Phosphor duotone icon in a tinted tile, or the 3D object. */
export function VaultGlyph({ category, size = 44, variant = "icon" }: { category: string; size?: number; variant?: "icon" | "object" | "filled" }) {
  const { cat, c } = useTheme();
  const meta = categoryOf(category);
  const col = cat(meta.key);
  if (variant === "object")
    return <Image source={meta.object3d} style={{ width: size, height: size }} contentFit="contain" accessibilityLabel={`${meta.label} vault`} />;
  const filled = variant === "filled";
  return (
    <View
      accessibilityLabel={`${meta.label} vault`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: filled ? col.fill : `${col.fill}26`,
      }}
    >
      <meta.Icon size={size * 0.55} color={filled ? c.ink : col.tint} weight="duotone" />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, alignSelf: "flex-start" },
  banner: { flexDirection: "row", gap: 12, padding: 14, borderRadius: radius.md, alignItems: "flex-start" },
  practice: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
