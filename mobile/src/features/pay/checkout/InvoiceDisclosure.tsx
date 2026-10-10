import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { CaretDownIcon, ReceiptIcon } from "@/components/icons";
import { MoneyText, Press, Row, Txt } from "@/components/ui";
import type { PaymentIntent } from "@/lib/api/pay-types";
import { layout, space, useTheme } from "@/theme";
import { dateTime } from "../format";
import { Paper, PAPER_MUTED, PaperLine, PaperRow } from "./paper";

/** "View invoice": occasional use, so it's a row that expands in place rather than a new screen. */
export function InvoiceDisclosure({ intent }: { intent: PaymentIntent }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const count = intent.lineItems.length;
  return (
    <View style={styles.wrap}>
      <Press
        onPress={() => setOpen((o) => !o)}
        scaleTo={0.99}
        accessibilityLabel={open ? "Hide invoice" : "View invoice"}
        accessibilityState={{ expanded: open }}
        style={styles.row}
      >
        <ReceiptIcon size={24} color={c.text} />
        <View style={styles.text}>
          <Txt v="labelL">{open ? "Hide invoice" : "View invoice"}</Txt>
          <Txt v="bodyM" color="textMuted" numberOfLines={1}>
            {intent.reference} · {count} {count === 1 ? "item" : "items"}
          </Txt>
        </View>
        <CaretDownIcon size={18} color={c.textMuted} style={open ? styles.flip : undefined} />
      </Press>
      {open ? <PaperInvoice intent={intent} /> : null}
    </View>
  );
}

function PaperInvoice({ intent }: { intent: PaymentIntent }) {
  const { c } = useTheme();
  return (
    <Paper>
      <Row style={styles.head}>
        <View style={styles.text}>
          <Txt v="labelL" color="ink">
            {intent.merchant.name}
          </Txt>
          <Txt v="caption" color={PAPER_MUTED}>
            {intent.description}
          </Txt>
        </View>
        <View style={styles.ref}>
          <Txt v="micro" color={PAPER_MUTED}>
            INVOICE
          </Txt>
          <Txt v="numS" color="ink">
            {intent.reference}
          </Txt>
        </View>
      </Row>
      <PaperLine />
      {intent.lineItems.map((li, i) => (
        <PaperRow key={`${i}-${li.description}`} inkLabel label={li.description} value={<MoneyText value={li.amount} currency={intent.currency} color={c.ink} />} />
      ))}
      <PaperLine />
      <PaperRow strong label="Total" value={<MoneyText v="numL" value={intent.amount} currency={intent.currency} color={c.ink} />} />
      <Txt v="caption" color={PAPER_MUTED}>
        Issued {dateTime(intent.createdAt)} · pay by {dateTime(intent.expiresAt)}
      </Txt>
    </Paper>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { minHeight: layout.rowMin, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 6 },
  text: { flex: 1, gap: 2 },
  flip: { transform: [{ rotate: "180deg" }] },
  head: { alignItems: "flex-start" },
  ref: { alignItems: "flex-end", gap: 2 },
});
