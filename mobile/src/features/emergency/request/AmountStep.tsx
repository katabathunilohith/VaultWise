import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { AmountKeypad, Banner, Button, Card, ModalScreen, PracticeBadge, Row, Skeleton, Stack, Txt } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import type { EmergencyOverview } from "@/lib/api/types";
import { haptic } from "@/lib/haptics";
import { moneyWhole, parseAmount } from "@/lib/money";
import { radius, space } from "@/theme";
import { blockedReason, maxRequest } from "../copy";
import { fmt } from "../format";
import { go, leave } from "../routes";
import { SplitLines } from "./PlanLines";
import type { usePlanPreview } from "./usePlanPreview";

/** What someone has typed, with the currency symbol and grouping: "₹12,500.5". */
function typedDisplay(text: string, currency: string) {
  const [whole = "", dec] = text.split(".");
  const grouped = moneyWhole(Number(whole || "0") * 100, currency);
  return dec === undefined ? grouped : `${grouped}.${dec}`;
}

export function AmountStep({
  o,
  text,
  onText,
  preview,
  onContinue,
}: {
  o: EmergencyOverview;
  text: string;
  onText: (t: string) => void;
  preview: ReturnType<typeof usePlanPreview>;
  onContinue: () => void;
}) {
  const cur = o.currency;
  const amount = parseAmount(text);
  const { current, shown, updating, error, retry } = preview;
  const blocked = !!current?.blocked;
  // A full week stops any amount, so say that up front instead of offering one.
  const weekFull = o.requestsLast7d >= o.rules.maxRequestsPer7d;
  const quick = weekFull ? 0 : Math.min(o.tier1Available, o.remainingCap);
  const ceiling = maxRequest(o);
  const hint = weekFull
    ? `You've made ${o.rules.maxRequestsPer7d} requests this week, the most your limit allows`
    : ceiling > 0
      ? `Up to ${fmt(ceiling, cur)} right now`
      : "Nothing available right now";

  // A safety limit engaging is a "warning" moment: once per amount, same frame as the banner.
  const warnedFor = useRef<number | null>(null);
  useEffect(() => {
    if (current?.blocked && warnedFor.current !== current.amount) {
      warnedFor.current = current.amount;
      haptic("warning");
    }
  }, [current]);

  return (
    <ModalScreen
      title="Emergency money"
      onClose={go.close}
      headerRight={<PracticeBadge compact />}
      footer={
        <>
          <AmountKeypad value={text} onChange={onText} />
          <Button label="Continue" armOnMount disabled={!current || blocked} onPress={onContinue} />
        </>
      }
    >
      <Stack gap={space.sm}>
        <Txt v="headline" accessibilityRole="header">
          How much do you need?
        </Txt>
        <Txt
          v="displayL"
          color={amount ? "text" : "textMuted"}
          numberOfLines={1}
          adjustsFontSizeToFit
          accessibilityLabel={`Amount, ${amount ? fmt(amount, cur) : "none yet"}`}
          accessibilityLiveRegion="polite"
        >
          {typedDisplay(text, cur)}
        </Txt>
        <Row style={styles.hintRow}>
          <Txt v="bodyM" color="textMuted" style={styles.flex}>
            {hint}
          </Txt>
          {quick > 0 ? (
            <Button
              label={`Use ${fmt(quick, cur)}`}
              variant="tonal"
              size="sm"
              accessibilityHint="Fills in everything Health can send straight away"
              onPress={() => onText(quick % 100 === 0 ? String(quick / 100) : (quick / 100).toFixed(2))}
            />
          ) : null}
        </Row>
      </Stack>

      {!amount ? (
        <Txt v="bodyM" color="textMuted">
          As you type, you&apos;ll see where the money comes from.
        </Txt>
      ) : error ? (
        <Stack gap={space.xs}>
          <Banner tone="danger" title="Couldn't check this amount" body={errorMessage(error)} />
          <Button label="Try again" variant="tonal" size="md" onPress={retry} />
        </Stack>
      ) : shown ? (
        <View style={updating ? styles.stale : undefined} accessibilityState={{ busy: updating }}>
          {shown.blocked && !updating ? (
            <Stack gap={space.xs}>
              <Banner tone="warning" title="That's past your safety limit." body={blockedReason(shown.checks, o, shown)} />
              <Button label="Ask for a higher limit" variant="tonal" size="md" onPress={leave.limits} />
              <Button label="Talk to a person" variant="tonal" size="md" onPress={leave.support} />
            </Stack>
          ) : (
            <Card>
              <SplitLines p={shown} currency={cur} />
            </Card>
          )}
        </View>
      ) : (
        <View style={[styles.loading, { borderRadius: radius.lg }]} accessibilityLabel="Working out where the money comes from">
          <Skeleton height={20} width="60%" />
          <Skeleton height={20} width="80%" />
        </View>
      )}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hintRow: { justifyContent: "space-between", minHeight: 44 },
  stale: { opacity: 0.5 },
  loading: { gap: space.sm, paddingVertical: space.sm },
});
