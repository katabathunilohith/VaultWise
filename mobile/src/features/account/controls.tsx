import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { CheckIcon, WarningCircleIcon, type Icon } from "@/components/icons";
import { Button, Divider, Press, Txt } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { layout, radius, space, useTheme } from "@/theme";

/** A titled group of rows on one surface, separated by hairlines (settings lists). */
export function Group({ title, children, note }: { title?: string; children: ReactNode; note?: string }) {
  const { c } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.group}>
      {title ? (
        <Txt v="labelM" color="textMuted" accessibilityRole="header" style={styles.groupTitle}>
          {title}
        </Txt>
      ) : null}
      <View style={[styles.groupCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {i > 0 ? <Divider /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {note ? (
        <Txt v="caption" color="textMuted" style={styles.groupNote}>
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

/** One option in a choose-one list. Whole row tappable, ≥56 pt, radio semantics for screen readers. */
export function RadioRow({
  label,
  description,
  selected,
  onPress,
  icon: IconCmp,
  tick = true,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  icon?: Icon;
  /** Play the selection tick (turn off when the row plays its own preview). */
  tick?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      hapticOnPressIn={tick && !selected ? "select.tick" : null}
      onPress={onPress}
      scaleTo={0.99}
      style={styles.row}
    >
      {IconCmp ? <IconCmp size={24} color={c.text} weight={selected ? "fill" : "regular"} /> : null}
      <View style={styles.rowText}>
        <Txt v="labelL">{label}</Txt>
        {description ? (
          <Txt v="bodyM" color="textMuted">
            {description}
          </Txt>
        ) : null}
      </View>
      <View style={[styles.radio, { borderColor: selected ? c.accent : c.borderStrong }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: c.accent }]} /> : null}
      </View>
    </Press>
  );
}

/** Checkbox row (acknowledgements, age confirmation). The tick is drawn, not just coloured. */
export function CheckRow({ label, description, checked, onChange, error }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; error?: string | null }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Press
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={description ? `${label}. ${description}` : label}
        hapticOnPressIn="select.tick"
        onPress={() => onChange(!checked)}
        scaleTo={0.99}
        style={styles.row}
      >
        <View
          style={[
            styles.box,
            {
              borderColor: checked ? c.accentFill : error ? c.danger : c.borderStrong,
              backgroundColor: checked ? c.accentFill : "transparent",
            },
          ]}
        >
          {checked ? <CheckIcon size={16} color={c.onAccentFill} weight="bold" /> : null}
        </View>
        <View style={styles.rowText}>
          <Txt v="labelL">{label}</Txt>
          {description ? (
            <Txt v="bodyM" color="textMuted">
              {description}
            </Txt>
          ) : null}
        </View>
      </Press>
      {error ? <FieldError text={error} /> : null}
    </View>
  );
}

/** Inline field error: icon + words in the danger colour. */
export function FieldError({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.fieldError} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <WarningCircleIcon size={16} color={c.danger} weight="bold" />
      <Txt v="caption" color="danger" style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}

/**
 * Error state for calm-core screens: the same words as the kit's ErrorState, with a plain icon
 * instead of a 3D object (no 3D in settings, limits or PIN screens).
 */
export function CalmError({ error, onRetry, title = "This didn't load" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <View style={[styles.errorIcon, { backgroundColor: c.surfaceRaised }]}>
        <WarningCircleIcon size={28} color={c.textMuted} />
      </View>
      <Txt v="titleL" align="center">
        {title}
      </Txt>
      <Txt v="bodyM" color="textMuted" align="center">
        {errorMessage(error)}
      </Txt>
      {onRetry ? <Button label="Try again" variant="tonal" size="md" onPress={onRetry} /> : null}
    </View>
  );
}

/** Small round icon button (Play, Info). 44 pt target, always labelled. */
export function IconButton({ icon: IconCmp, label, onPress, disabled }: { icon: Icon; label: string; onPress: () => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        if (!disabled) onPress();
      }}
      hitSlop={6}
      style={[styles.iconBtn, { backgroundColor: c.surfaceRaised, borderColor: c.border, opacity: disabled ? 0.4 : 1 }]}
    >
      <IconCmp size={20} color={c.text} weight="fill" />
    </Press>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.xs },
  groupTitle: { paddingHorizontal: 4 },
  groupCard: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md },
  groupNote: { paddingHorizontal: 4 },
  row: { minHeight: layout.rowMin, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 },
  rowText: { flex: 1, gap: 2 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  fieldError: { flexDirection: "row", alignItems: "center", gap: 6 },
  center: { alignItems: "center", justifyContent: "center", gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  errorIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
  iconBtn: { width: layout.hit, height: layout.hit, borderRadius: layout.hit / 2, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
});
