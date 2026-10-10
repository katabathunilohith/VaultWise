import { StyleSheet, useWindowDimensions, View } from "react-native";
import { RepeatIcon } from "@/components/icons";
import { Amount, Button, Card, Stack, Txt, useNow } from "@/components/ui";
import type { InvestCore } from "@/lib/api/types";
import { money } from "@/lib/money";
import { space, useTheme } from "@/theme";
import { asFrequency, everyWord, fmtDay, fmtMoney } from "../format";
import { Pnl } from "../Pnl";
import { activePlan } from "../use-invest";

/** Core value, total gain/loss since the first buy, and any cash waiting to be invested. */
export function CoreHero({ core }: { core: InvestCore }) {
  const { total, cash, cost, pnl } = core.holdings;
  const currency = core.currency;
  return (
    <Stack gap={space.xxs}>
      <Txt v="labelM" color="textMuted">
        Core value
      </Txt>
      <Amount value={total + cash} currency={currency} size="l" />
      {cost > 0 ? (
        <Pnl value={pnl} currency={currency} base={cost} suffix="since you started" size="hero" />
      ) : (
        <Txt v="bodyM" color="textMuted">
          Nothing invested yet.
        </Txt>
      )}
      {cash > 0 ? (
        <Txt v="caption" color="textMuted">
          {`Includes ${money(cash, currency)} waiting to be invested.`}
        </Txt>
      ) : null}
    </Stack>
  );
}

/** The regular plan: amount, how often, and the exact next buy. */
export function PlanCard({ core }: { core: InvestCore }) {
  const { c } = useTheme();
  const now = useNow(60_000);
  const plan = activePlan(core);
  const freq = asFrequency(plan?.frequency);
  const due = plan ? plan.next_run_at <= now : false;
  return (
    <Card>
      <View style={styles.planRow}>
        <RepeatIcon size={24} color={c.textMuted} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="labelL">{plan ? `${fmtMoney(plan.amount, core.currency)} ${everyWord(freq)}` : "No regular plan"}</Txt>
          <Txt v="bodyM" color="textMuted">
            {plan
              ? due
                ? "The next buy is due now. You can change or stop the plan any time."
                : `Next buy ${fmtDay(plan.next_run_at)}. You can change or stop it any time.`
              : "A regular plan buys automatically on a schedule you choose."}
          </Txt>
        </View>
      </View>
    </Card>
  );
}

/**
 * Inline action row in the lower middle (R4: never pinned above the tab bar). Side by side
 * normally; stacked with the primary at the bottom at large text sizes.
 */
export function CoreActions({ core, onPlan, onLumpSum }: { core: InvestCore; onPlan: () => void; onLumpSum: () => void }) {
  const { fontScale } = useWindowDimensions();
  const plan = activePlan(core);
  const planLabel = plan ? `Change ${asFrequency(plan.frequency)} plan` : "Start a monthly plan";
  const stacked = fontScale >= 1.3;
  const primary = <Button key="plan" label={planLabel} onPress={onPlan} style={stacked ? undefined : styles.half} />;
  const tonal = <Button key="lump" label="Add lump sum" variant="tonal" onPress={onLumpSum} style={stacked ? undefined : styles.half} />;
  return <View style={stacked ? styles.stack : styles.row}>{stacked ? [tonal, primary] : [primary, tonal]}</View>;
}

const styles = StyleSheet.create({
  planRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  row: { flexDirection: "row", gap: space.sm },
  stack: { gap: space.sm },
  half: { flex: 1 },
});
