import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ArrowDownLeftIcon, ArrowUpRightIcon, ArrowsClockwiseIcon, CoinsIcon, LifebuoyIcon, RepeatIcon, type Icon } from "@/components/icons";
import { Button, Divider, MoneyText, Txt } from "@/components/ui";
import type { JournalLine } from "@/lib/api/types";
import { money } from "@/lib/money";
import { layout, space, useTheme } from "@/theme";
import { formatWhen } from "./format";

const KIND_ICON: Record<string, Icon> = {
  deposit: ArrowDownLeftIcon,
  contribution_rule: RepeatIcon,
  roundup: CoinsIcon,
  withdrawal: ArrowUpRightIcon,
  emergency: LifebuoyIcon,
};

const PAGE = 8;

/** Ledger lines for one vault, newest first. Signed amounts carry +/− as well as colour. */
export function HistoryList({ lines }: { lines: JournalLine[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? lines : lines.slice(0, PAGE);
  return (
    <View>
      {shown.map((line, i) => (
        <View key={line.journal_id}>
          {i > 0 ? <Divider /> : null}
          <HistoryRow line={line} />
        </View>
      ))}
      {lines.length > PAGE ? (
        <Button
          label={all ? "Show fewer" : `Show all ${lines.length}`}
          variant="ghost"
          size="md"
          haptic={null}
          onPress={() => setAll((v) => !v)}
          style={{ marginTop: space.xs }}
        />
      ) : null}
    </View>
  );
}

function HistoryRow({ line }: { line: JournalLine }) {
  const { c, gain, loss } = useTheme();
  const IconCmp = KIND_ICON[line.kind] ?? ArrowsClockwiseIcon;
  const incoming = line.amount >= 0;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${line.memo}, ${money(Math.abs(line.amount), line.currency)} ${incoming ? "added" : "taken out"}, ${formatWhen(line.created_at)}`}
    >
      <View style={[styles.icon, { backgroundColor: c.surfaceRaised }]}>
        <IconCmp size={20} color={c.text} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="labelM" numberOfLines={2}>
          {line.memo}
        </Txt>
        <Txt v="caption" color="textMuted">
          {formatWhen(line.created_at)}
        </Txt>
      </View>
      <MoneyText value={line.amount} currency={line.currency} signed color={incoming ? gain : loss} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: layout.rowMin, paddingVertical: 10 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
