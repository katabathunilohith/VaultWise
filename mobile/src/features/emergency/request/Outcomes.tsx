import { useEffect, useRef } from "react";
import { AccessibilityInfo, ActivityIndicator, StyleSheet, View } from "react-native";
import { CheckCircleIcon, ClockIcon, WarningCircleIcon, type Icon } from "@/components/icons";
import { Button, Card, ModalScreen, PracticeBadge, ProgressRing, Row, Stack, Txt, useNow } from "@/components/ui";
import type { EmergencyOverview, EmergencyPreview } from "@/lib/api/types";
import { haptic } from "@/lib/haptics";
import { space, useTheme, type Palette } from "@/theme";
import { clockTime, fmt, whenText } from "../format";
import { go, leave } from "../routes";
import { PlanItems } from "./PlanLines";

function useAnnounce(text: string) {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
}

function OutcomeHeader({ icon: IconCmp, color, title, body }: { icon: Icon; color: keyof Palette; title: string; body: string }) {
  const { c } = useTheme();
  useAnnounce(`${title} ${body}`);
  return (
    <Stack gap={space.sm}>
      <IconCmp size={40} color={c[color]} weight="fill" />
      <Txt v="displayM" accessibilityRole="header">
        {title}
      </Txt>
      <Txt v="bodyL">{body}</Txt>
    </Stack>
  );
}

/** Tier 1 (or a finished Tier 2 pause): the money has gone. Plain outcome, no flourish. */
export function Released({
  o,
  plan,
  receiptRequired,
  onAddReceipt,
}: {
  o: EmergencyOverview;
  plan: EmergencyPreview;
  receiptRequired: boolean;
  onAddReceipt: () => void;
}) {
  const cur = o.currency;
  const days = o.rules.receiptWindowDays;
  const from =
    plan.tier2 > 0 && plan.tier1 > 0
      ? `${fmt(plan.amount, cur)} is on its way to your bank: ${fmt(plan.tier1, cur)} from Health and ${fmt(plan.tier2, cur)} from your other vaults.`
      : plan.tier2 > 0
        ? `${fmt(plan.amount, cur)} is on its way to your bank from your other vaults.`
        : `${fmt(plan.amount, cur)} is on its way to your bank from Health.`;
  return (
    <ModalScreen
      onClose={go.close}
      headerRight={<PracticeBadge compact />}
      footer={
        <>
          <Button label="Add the receipt now" variant="tonal" size="md" onPress={onAddReceipt} />
          <Button label="Done" armOnMount onPress={go.close} />
        </>
      }
    >
      <OutcomeHeader icon={CheckCircleIcon} color="success" title="Sent." body={from} />
      <Card>
        <PlanItems items={plan.items} currency={cur} holdSeconds={o.rules.tier2HoldSeconds} stage="sent" />
      </Card>
      <Txt v="bodyM" color="textMuted">
        {receiptRequired
          ? `Add the receipt within ${days} days — it never blocks the money.`
          : `A receipt is optional this time. If you have one, add it within ${days} days.`}
      </Txt>
    </ModalScreen>
  );
}

/**
 * Tier 2 safety pause. Calm: one soft tick at the start, then a tick on each of the last five
 * seconds only. Screen readers hear 10 seconds and the release. There's no cancel endpoint, so
 * the way to stop it is a person.
 */
export function SafetyPause({
  o,
  plan,
  releaseAt,
  startedAt,
  onReleased,
}: {
  o: EmergencyOverview;
  plan: EmergencyPreview;
  releaseAt: number;
  startedAt: number;
  onReleased: () => void;
}) {
  const { c } = useTheme();
  const cur = o.currency;
  const now = useNow(250);
  const remainingMs = Math.max(0, releaseAt - now);
  const secs = Math.ceil(remainingMs / 1000);
  const total = Math.max(1000, releaseAt - startedAt);
  const progress = 1 - remainingMs / total;

  // One soft tick as the pause starts; the ref stops a re-mount or re-render repeating it.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    haptic("emergency.tick");
  }, []);
  const ticked = useRef<number | null>(null);
  const released = useRef(false);
  useEffect(() => {
    if (secs >= 1 && secs <= 5 && ticked.current !== secs) {
      ticked.current = secs;
      haptic("emergency.finalTick");
    }
    if (secs === 10) AccessibilityInfo.announceForAccessibility("10 seconds until your money moves.");
    if (secs === 0 && !released.current) {
      released.current = true;
      onReleased();
    }
  }, [secs, onReleased]);

  const body =
    plan.tier1 > 0
      ? `${fmt(plan.tier1, cur)} from Health is already on its way. ${fmt(plan.tier2, cur)} from your other vaults follows ${whenText(releaseAt, now)}.`
      : `${fmt(plan.tier2, cur)} from your other vaults moves to your bank ${whenText(releaseAt, now)}.`;
  useAnnounce(`Short safety pause. ${body}`);

  return (
    <ModalScreen
      onClose={go.close}
      headerRight={<PracticeBadge compact />}
      scroll={false}
      footer={<Button label="Done" armOnMount onPress={go.close} accessibilityHint="Closes this screen. The money still moves on its own." />}
    >
      <Stack gap={space.xs}>
        <Txt v="headline" accessibilityRole="header">
          Short safety pause
        </Txt>
        <Txt v="bodyL">{body}</Txt>
      </Stack>
      <View style={styles.centre}>
        <View accessible accessibilityRole="timer" accessibilityLabel={`${secs} seconds left. Moves at ${clockTime(releaseAt)}.`}>
          <ProgressRing value={progress} size={208} stroke={10} color={c.accent}>
            <Txt v="numXL" accessible={false}>
              {secs}
            </Txt>
            <Txt v="caption" color="textMuted" accessible={false}>
              {secs === 1 ? "second" : "seconds"}
            </Txt>
          </ProgressRing>
        </View>
        <Txt v="bodyM" color="textMuted" align="center">
          You can close this. The money moves on its own.
        </Txt>
        <Button label="Need to stop it? Talk to a person" variant="tonal" size="md" onPress={leave.support} style={styles.stop} />
      </View>
    </ModalScreen>
  );
}

/** Repeat use within 72 hours: the release is scheduled after a longer pause. */
export function CoolingOff({ o, plan, releaseAt }: { o: EmergencyOverview; plan: EmergencyPreview; releaseAt: number }) {
  const cur = o.currency;
  return (
    <ModalScreen onClose={go.close} headerRight={<PracticeBadge compact />} footer={<Button label="Done" armOnMount onPress={go.close} />}>
      <OutcomeHeader
        icon={ClockIcon}
        color="textMuted"
        title="Coming after a safety pause"
        body={`${fmt(plan.amount, cur)} reaches your bank ${whenText(releaseAt)}. You've made several requests in 3 days, so there's a ${o.rules.cooloffHours}-hour pause.`}
      />
      <Card>
        <PlanItems items={plan.items} currency={cur} holdSeconds={o.rules.tier2HoldSeconds} stage="paused" />
      </Card>
      <Button label="Need it sooner? Talk to a person" variant="tonal" size="md" onPress={leave.support} />
    </ModalScreen>
  );
}

/** A safety limit stopped the request. Always a next step and a person. */
export function Blocked({ reason }: { reason: string }) {
  return (
    <ModalScreen
      onClose={go.close}
      headerRight={<PracticeBadge compact />}
      footer={
        <>
          <Button label="Ask for a higher limit" variant="tonal" size="md" onPress={leave.limits} />
          <Button label="Talk to a person" armOnMount onPress={leave.support} />
        </>
      }
    >
      <OutcomeHeader icon={WarningCircleIcon} color="warning" title="That's past your safety limit." body={reason} />
      <Txt v="bodyM" color="textMuted">
        Nothing has moved from your vaults.
      </Txt>
    </ModalScreen>
  );
}

/**
 * Tier 1 between the hold and the answer — usually under a second. Closing here means "carry on
 * in the background", never cancel: the request has already been sent.
 */
export function Sending() {
  const { c } = useTheme();
  return (
    <ModalScreen onClose={go.close} headerRight={<PracticeBadge compact />} scroll={false}>
      <View style={styles.sending} accessibilityLiveRegion="polite">
        <Row gap={space.sm}>
          <ActivityIndicator color={c.textMuted} />
          <Txt v="bodyL" color="textMuted">
            Sending your request…
          </Txt>
        </Row>
      </View>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md },
  stop: { alignSelf: "stretch", marginTop: space.xs },
  sending: { flex: 1, alignItems: "center", justifyContent: "center" },
});
