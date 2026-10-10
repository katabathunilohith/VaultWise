import { StyleSheet, View } from "react-native";
import { CheckIcon, ClockIcon } from "@/components/icons";
import { Amount, Banner, Button, Card, Divider, HoldToConfirm, ModalScreen, PracticeBadge, Press, Row, StatusPill, Stack, Txt } from "@/components/ui";
import { EMERGENCY_REASONS, type EmergencyOverview, type EmergencyPreview } from "@/lib/api/types";
import { haptic } from "@/lib/haptics";
import { layout, radius, space, useTheme } from "@/theme";
import { blockedReason, CHECK_PILL, plainCheck } from "../copy";
import { fmt } from "../format";
import { leave } from "../routes";
import { PlanItems } from "./PlanLines";

/** When the money arrives, in plain words. */
export function releaseText(p: EmergencyPreview, o: EmergencyOverview) {
  const cur = o.currency;
  const hold = o.rules.tier2HoldSeconds;
  if (p.coolingOff) return `Because of several requests in 3 days, this reaches your bank after a ${o.rules.cooloffHours}-hour pause.`;
  if (p.tier1 > 0 && p.tier2 > 0) return `${fmt(p.tier1, cur)} reaches your bank straight away. ${fmt(p.tier2, cur)} follows ${hold} seconds after your PIN.`;
  if (p.tier2 > 0) return `Reaches your bank ${hold} seconds after your PIN.`;
  return "Reaches your bank straight away.";
}

export function ReviewStep({
  o,
  plan,
  reasonCode,
  note,
  attest,
  onAttest,
  error,
  onBack,
  onConfirm,
}: {
  o: EmergencyOverview;
  plan: EmergencyPreview;
  reasonCode: string;
  note: string;
  attest: boolean;
  onAttest: (v: boolean) => void;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const cur = o.currency;
  const checks = plan.checks.map((g) => plainCheck(g, o, plan));
  const footer = plan.blocked ? (
    <>
      <Button label="Ask for a higher limit" variant="tonal" size="md" onPress={leave.limits} />
      <Button label="Talk to a person" armOnMount onPress={leave.support} />
    </>
  ) : (
    <HoldToConfirm label={`Hold to get ${fmt(plan.amount, cur)}`} disabled={!attest} onConfirm={onConfirm} commitHaptic={!plan.needsPin} />
  );

  return (
    <ModalScreen title="Emergency money" back={onBack} headerRight={<PracticeBadge compact />} footer={footer}>
      <Stack gap={space.xs}>
        <Txt v="headline" accessibilityRole="header">
          Check and confirm
        </Txt>
        <Amount value={plan.amount} currency={cur} size="l" hideDecimals={plan.amount % 100 === 0} animate={false} />
      </Stack>

      {plan.blocked ? <Banner tone="warning" title="That's past your safety limit." body={blockedReason(plan.checks, o, plan)} /> : null}
      {error ? <Banner tone="danger" title="That didn't go through" body={error} /> : null}

      <Card>
        <Txt v="titleM" accessibilityRole="header">
          Where it comes from
        </Txt>
        <PlanItems items={plan.items} currency={cur} holdSeconds={o.rules.tier2HoldSeconds} />
        <Divider />
        <InfoLine text={releaseText(plan, o)} />
      </Card>

      <Card>
        <Row style={styles.between}>
          <Txt v="bodyM" color="textMuted">
            Reason
          </Txt>
          <Txt v="labelM" align="right" style={styles.flex}>
            {EMERGENCY_REASONS[reasonCode] ?? reasonCode}
          </Txt>
        </Row>
        {note.trim() ? (
          <Txt v="bodyM" color="textMuted">
            {note.trim()}
          </Txt>
        ) : null}
      </Card>

      <Stack gap={space.xs}>
        <Txt v="titleM" accessibilityRole="header">
          Safety checks
        </Txt>
        {checks.map((ch, i) => (
          <View key={ch.key}>
            {i > 0 ? <Divider /> : null}
            <Row style={styles.check}>
              <View accessible accessibilityLabel={`${ch.label}: ${CHECK_PILL[ch.state].word}. ${ch.detail}`} style={styles.flex}>
                <Txt v="labelM">{ch.label}</Txt>
                <Txt v="bodyM" color="textMuted">
                  {ch.detail}
                </Txt>
              </View>
              <StatusPill tone={CHECK_PILL[ch.state].tone} label={CHECK_PILL[ch.state].word} />
            </Row>
          </View>
        ))}
      </Stack>

      {plan.blocked ? null : (
        <Stack gap={space.xs}>
          <Attest checked={attest} onChange={onAttest} />
          <Txt v="caption" color="textMuted">
            {attest
              ? `Add the receipt within ${o.rules.receiptWindowDays} days. It never blocks the money.`
              : "Tick this to confirm. Then press and hold the button below."}
          </Txt>
        </Stack>
      )}
    </ModalScreen>
  );
}

function InfoLine({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <Row gap={space.xs} style={styles.info}>
      <ClockIcon size={18} color={c.textMuted} />
      <Txt v="bodyM" style={styles.flex}>
        {text}
      </Txt>
    </Row>
  );
}

/** The genuine-emergency confirmation, as a checkbox. Required before the hold control works. */
function Attest({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { c } = useTheme();
  const label = "I confirm this is a genuine emergency";
  return (
    <Press
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      scaleTo={0.99}
      onPress={() => {
        haptic(checked ? "toggle.off" : "toggle.on");
        onChange(!checked);
      }}
      style={[styles.attest, { backgroundColor: c.surface, borderColor: checked ? c.primary : c.border }]}
    >
      <View style={[styles.box, { borderColor: checked ? c.primary : c.borderStrong, backgroundColor: checked ? c.primary : "transparent" }]}>
        {checked ? <CheckIcon size={18} color={c.onPrimary} weight="bold" /> : null}
      </View>
      <Txt v="labelL" style={styles.flex}>
        {label}
      </Txt>
    </Press>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  between: { justifyContent: "space-between", gap: space.md },
  check: { alignItems: "flex-start", gap: space.sm, paddingVertical: space.xs },
  info: { alignItems: "flex-start" },
  attest: {
    minHeight: layout.rowMin,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  box: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
