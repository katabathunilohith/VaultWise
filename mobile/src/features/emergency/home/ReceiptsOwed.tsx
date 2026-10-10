import { StyleSheet, View } from "react-native";
import { ReceiptIcon } from "@/components/icons";
import { Button, Card, Divider, Row, StatusPill, Txt, useNow } from "@/components/ui";
import type { EmergencyHistoryItem } from "@/lib/api/types";
import { space, useTheme } from "@/theme";
import { receiptDueText, receiptPill } from "../copy";
import { fmt, shortDate } from "../format";
import { go } from "../routes";

/** Sits at the top of the tab whenever a receipt is owed. The money already arrived; this follows up. */
export function ReceiptsOwed({ items, currency }: { items: EmergencyHistoryItem[]; currency: string }) {
  const { c } = useTheme();
  const now = useNow(60_000);
  return (
    <Card>
      <Row gap={space.xs}>
        <ReceiptIcon size={22} color={c.text} />
        <Txt v="titleM" accessibilityRole="header" style={styles.flex}>
          {items.length === 1 ? "Receipt owed" : `${items.length} receipts owed`}
        </Txt>
      </Row>
      {items.map((h, i) => {
        const pill = receiptPill(h);
        const due = receiptDueText(h, now);
        return (
          <View key={h.id} style={styles.item}>
            {i > 0 ? <Divider /> : null}
            <View accessible accessibilityLabel={`${fmt(h.amount, currency)}, ${h.reason}, requested ${shortDate(h.createdAt)}. ${pill.label}. ${due}`} style={styles.text}>
              <Row style={styles.between}>
                <Txt v="labelL" numberOfLines={1} style={styles.flex}>
                  {h.reason}
                </Txt>
                <Txt v="numM">{fmt(h.amount, currency)}</Txt>
              </Row>
              <Row gap={space.xs}>
                <StatusPill tone={pill.tone} label={pill.label} icon={pill.icon} />
                <Txt v="caption" color="textMuted">
                  Requested {shortDate(h.createdAt)}
                </Txt>
              </Row>
              <Txt v="bodyM" color="textMuted">
                {due}
              </Txt>
            </View>
            <Button label="Add receipt" variant="tonal" size="md" icon={ReceiptIcon} onPress={() => go.receipt(h.id)} accessibilityHint={`For ${h.reason}, ${fmt(h.amount, currency)}`} />
          </View>
        );
      })}
      <Txt v="caption" color="textMuted">
        A receipt never blocks money you&apos;ve already had.
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  item: { gap: space.sm },
  text: { gap: space.xxs },
  between: { justifyContent: "space-between" },
});
