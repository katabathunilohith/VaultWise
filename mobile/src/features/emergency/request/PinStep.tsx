import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WarningCircleIcon } from "@/components/icons";
import { Button, ModalScreen, PinPad, PracticeBadge, Row, Stack, Txt } from "@/components/ui";
import { DEMO_PIN } from "@/lib/api/demo";
import type { EmergencyOverview, EmergencyPreview } from "@/lib/api/types";
import { space, useTheme } from "@/theme";
import { fmt } from "../format";
import { leave } from "../routes";

/**
 * Tier 2 PIN. The pad sits at the bottom edge (R9) and submits on the last digit. Wrong PINs
 * shake the dots (the `errors` counter) and say so in words.
 */
export function PinStep({
  o,
  plan,
  demo,
  length,
  onLength,
  errors,
  resets,
  message,
  busy,
  onBack,
  onPin,
}: {
  o: EmergencyOverview;
  plan: EmergencyPreview;
  demo: boolean;
  length: number;
  onLength: (n: number) => void;
  errors: number;
  /** Bumped after a failure that wasn't the PIN, to clear the dots without the wrong-PIN shake. */
  resets: number;
  message: string | null;
  busy: boolean;
  onBack: () => void;
  onPin: (pin: string) => void;
}) {
  const { c } = useTheme();
  const cur = o.currency;
  return (
    <ModalScreen title="Emergency money" back={onBack} headerRight={<PracticeBadge compact />} scroll={false}>
      <View style={styles.fill}>
        <Stack gap={space.xs}>
          <Txt v="headline" accessibilityRole="header">
            Enter your PIN
          </Txt>
          <Txt v="bodyL" color="textMuted">
            {plan.tier2 > 0
              ? `Your PIN opens your other vaults for ${fmt(plan.tier2, cur)}. It moves ${o.rules.tier2HoldSeconds} seconds later.`
              : "Your PIN confirms it's you for this request."}
          </Txt>
          {demo ? (
            <Txt v="caption" color="textMuted">
              Demo PIN: {DEMO_PIN}
            </Txt>
          ) : null}
        </Stack>

        <View style={styles.spacer} />

        <View style={styles.status} accessibilityLiveRegion="polite">
          {busy ? (
            <Row gap={space.xs}>
              <ActivityIndicator color={c.textMuted} />
              <Txt v="bodyM" color="textMuted">
                Checking your PIN…
              </Txt>
            </Row>
          ) : message ? (
            <Row gap={space.xs}>
              <WarningCircleIcon size={20} color={c.danger} weight="fill" />
              <Txt v="labelM" color="danger" style={styles.flex}>
                {message}
              </Txt>
            </Row>
          ) : null}
        </View>

        <Row style={styles.links}>
          <Button label="Forgot your PIN?" variant="ghost" size="sm" onPress={leave.support} accessibilityHint="Talk to a person" />
          {demo ? null : (
            <Button
              label={length === 4 ? "Use 6 digits" : "Use 4 digits"}
              variant="ghost"
              size="sm"
              haptic="select.tick"
              onPress={() => onLength(length === 4 ? 6 : 4)}
            />
          )}
        </Row>

        <View style={styles.pad}>
          <PinPad key={`${length}-${resets}`} length={length} error={errors} disabled={busy} onComplete={onPin} />
        </View>
      </View>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flexShrink: 1 },
  spacer: { flex: 1, minHeight: space.md },
  status: { minHeight: 28, alignItems: "center", justifyContent: "center" },
  links: { justifyContent: "space-between", minHeight: 44 },
  // ModalScreen leaves the home indicator + 24 pt; this lifts the pad's bottom edge to ≈48 pt (R9).
  pad: { marginBottom: space.xl, marginTop: space.xs },
});
