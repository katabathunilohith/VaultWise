import { StyleSheet, View } from "react-native";
import { CaretRightIcon } from "@/components/icons";
import { Divider, EmptyState, MoneyText, Press, SectionHeader, StatusPill, Txt, useNow } from "@/components/ui";
import type { EmergencyHistoryItem } from "@/lib/api/types";
import { layout, space, useTheme } from "@/theme";
import { requestStatus, tierText } from "../copy";
import { fmt, rowDate } from "../format";
import { go } from "../routes";

/** Past requests. Each opens its release tracker. */
export function History({ items, currency }: { items: EmergencyHistoryItem[]; currency: string }) {
  const now = useNow(15_000, items.some((h) => h.status === "processing"));
  return (
    <View>
      <SectionHeader title="Your requests" />
      {items.length === 0 ? (
        <EmptyState title="No requests yet" body="When you get emergency money, each request shows here with every step." />
      ) : (
        items.map((h, i) => (
          <View key={h.id}>
            {i > 0 ? <Divider /> : null}
            <HistoryRow h={h} currency={currency} now={now} />
          </View>
        ))
      )}
    </View>
  );
}

function HistoryRow({ h, currency, now }: { h: EmergencyHistoryItem; currency: string; now: number }) {
  const { c } = useTheme();
  const status = requestStatus(h, now);
  const date = rowDate(h.createdAt, now);
  return (
    <Press
      onPress={() => go.track(h.id)}
      scaleTo={0.99}
      accessibilityLabel={`${h.reason}, ${fmt(h.amount, currency)}, ${tierText(h.tier)}, ${status.label}, ${date}`}
      accessibilityHint="Opens every step of this request"
      style={styles.row}
    >
      <View style={styles.text}>
        <Txt v="labelL" numberOfLines={1}>
          {h.reason}
        </Txt>
        <Txt v="caption" color="textMuted">
          {tierText(h.tier)} · {date}
        </Txt>
        <StatusPill tone={status.tone} label={status.label} icon={status.icon} />
      </View>
      <MoneyText value={h.amount} currency={currency} v="numM" />
      <CaretRightIcon size={18} color={c.textMuted} />
    </Press>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: layout.rowMin, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  text: { flex: 1, gap: space.xxs },
});
