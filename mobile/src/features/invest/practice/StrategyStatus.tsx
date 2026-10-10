import { StyleSheet, View } from "react-native";
import { CheckCircleIcon, ClockIcon, LockIcon, type Icon } from "@/components/icons";
import { StatusPill, Txt } from "@/components/ui";
import { layout, space, useTheme } from "@/theme";
import { paperProgress, type GovernanceStage } from "./parse";

interface StageCopy {
  title: string;
  pill: string;
  detail: string;
  icon: Icon;
}

/** Plain words for each gate; the server's wording uses terms people shouldn't have to learn. */
function copyFor(stage: GovernanceStage): StageCopy {
  switch (stage.key) {
    case "backtest":
      return stage.passed
        ? { title: "Test on past prices", pill: "Passed", detail: "It held up on past prices it wasn't tuned on.", icon: CheckCircleIcon }
        : {
            title: "Test on past prices",
            pill: "Not passed yet",
            detail: "It has to hold up on past prices it wasn't tuned on before it can do anything more.",
            icon: ClockIcon,
          };
    case "paper": {
      if (stage.passed) return { title: "Practice period", pill: "Done", detail: "It finished its practice period.", icon: CheckCircleIcon };
      const p = paperProgress(stage.detail);
      return {
        title: "Practice period",
        pill: "Running",
        detail: p
          ? `${p.days} of ${p.daysNeeded} days and ${p.trades} of ${p.tradesNeeded} practice trades so far.`
          : "It needs a full period of practice trades first.",
        icon: ClockIcon,
      };
    }
    case "live":
      return {
        title: "Real money",
        pill: "Off",
        detail: "Real trading would need a licensed broker. It's switched off in this practice build.",
        icon: LockIcon,
      };
    default:
      return { title: stage.label || "Another check", pill: stage.passed ? "Passed" : "Not yet", detail: "", icon: stage.passed ? CheckCircleIcon : ClockIcon };
  }
}

/** The headline status, in one plain sentence. */
export function statusSentence(stages: GovernanceStage[]) {
  const passed = (k: string) => stages.find((s) => s.key === k)?.passed === true;
  if (!passed("backtest"))
    return {
      title: "Paper trading only",
      body: "The strategy hasn't passed its test on past prices, so it can't use money. It places pretend trades so you can see how it behaves.",
    };
  if (!passed("paper"))
    return { title: "Still in its practice period", body: "It passed its test on past prices. It now has to show the same with pretend trades." };
  return { title: "Real trading is off", body: "Real trading would need a licensed broker, which this practice build doesn't have." };
}

/** The three gates, as a calm list (icon + word for each state; no colour coding). */
export function StrategyStages({ stages }: { stages: GovernanceStage[] }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="list">
      {stages.map((s) => {
        const copy = copyFor(s);
        const IconCmp = copy.icon;
        return (
          <View key={s.key} style={styles.row} accessible accessibilityLabel={`${copy.title}: ${copy.pill}. ${copy.detail}`}>
            <IconCmp size={22} color={c.textMuted} weight={s.passed ? "fill" : "regular"} />
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Txt v="labelL" style={{ flexShrink: 1 }}>
                  {copy.title}
                </Txt>
                <StatusPill tone="neutral" label={copy.pill} icon={IconCmp} />
              </View>
              {copy.detail ? (
                <Txt v="bodyM" color="textMuted">
                  {copy.detail}
                </Txt>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm, minHeight: layout.rowMin, paddingVertical: space.xs },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.xs, flexWrap: "wrap" },
});
