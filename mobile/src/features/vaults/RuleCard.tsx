import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { RepeatIcon } from "@/components/icons";
import { Button, Card, Press, Txt } from "@/components/ui";
import type { Vault } from "@/lib/api/types";
import { layout, space, useTheme } from "@/theme";
import { formatDate, monthlyFromFixed, framing, ruleLine } from "./format";

/** The vault's auto-save rule, when it next runs, and an Edit entry point. */
export function RuleCard({ vault, onEdit }: { vault: Vault; onEdit: () => void }) {
  const { c } = useTheme();
  const { rule } = vault;
  const line = ruleLine(rule, vault.currency);
  const detail =
    rule.type === "fixed" && rule.amount
      ? framing(monthlyFromFixed(rule.amount, rule.frequency ?? "monthly"), vault.currency)
      : rule.type === "percent_income"
        ? "Goes in when your pay lands in your bank."
        : rule.type === "roundup"
          ? "Spare change from card spends goes in."
          : "Nothing goes in automatically. Add money when you like.";
  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: c.surfaceRaised }]}>
          <RepeatIcon size={22} color={c.text} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="caption" color="textMuted">
            Auto-save
          </Txt>
          <Txt v="labelL">{line}</Txt>
        </View>
        <Button label="Edit" variant="tonal" size="sm" onPress={onEdit} accessibilityHint="Change how this vault fills up" />
      </View>
      <Txt v="bodyM" color="textMuted">
        {detail}
      </Txt>
      {rule.type !== "none" ? (
        <Press
          onPress={() => router.push("/upcoming")}
          accessibilityRole="link"
          accessibilityLabel={`${rule.nextRunAt ? `Next on ${formatDate(rule.nextRunAt)}. ` : ""}See upcoming auto-saves to skip one or pause them all`}
          hitSlop={8}
          style={styles.link}
        >
          {rule.nextRunAt ? (
            <Txt v="caption" color="textMuted">
              Next on {formatDate(rule.nextRunAt)}.
            </Txt>
          ) : null}
          <Txt v="labelM" color="accent">
            Skip one or pause in Upcoming
          </Txt>
        </Press>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  link: { minHeight: layout.hit, justifyContent: "center", alignSelf: "flex-start", gap: 2 },
});
