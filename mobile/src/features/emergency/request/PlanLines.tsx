import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { MoneyText, Row, Txt, VaultGlyph } from "@/components/ui";
import type { EmergencyPlanItem, EmergencyPreview } from "@/lib/api/types";
import { layout, space } from "@/theme";
import { fmt } from "../format";
import { OtherVaultsGlyph } from "../OtherVaultsGlyph";

/** "₹X from Health now" / "₹Y from other vaults after your PIN and a short pause". */
export function SplitLines({ p, currency }: { p: Pick<EmergencyPreview, "tier1" | "tier2">; currency: string }) {
  return (
    <View style={styles.list}>
      {p.tier1 > 0 ? (
        <Line glyph={<VaultGlyph category="health" size={36} />} label="from Health now" amount={p.tier1} currency={currency} />
      ) : null}
      {p.tier2 > 0 ? (
        <Line glyph={<OtherVaultsGlyph />} label="from other vaults after your PIN and a short pause" amount={p.tier2} currency={currency} />
      ) : null}
    </View>
  );
}

function Line({ glyph, label, amount, currency }: { glyph: ReactNode; label: string; amount: number; currency: string }) {
  return (
    <Row gap={space.sm} style={styles.line}>
      {glyph}
      <View accessible accessibilityLabel={`${fmt(amount, currency)} ${label}`} style={styles.flex}>
        <MoneyText value={amount} currency={currency} v="numL" />
        <Txt v="bodyM" color="textMuted">
          {label}
        </Txt>
      </View>
    </Row>
  );
}

/** Every vault the request draws from, in order, with when it moves (or that it has). */
export function PlanItems({
  items,
  currency,
  holdSeconds,
  stage = "planned",
}: {
  items: EmergencyPlanItem[];
  currency: string;
  holdSeconds: number;
  /** planned: before confirming · sent: on its way · paused: waiting out a longer safety pause. */
  stage?: "planned" | "sent" | "paused";
}) {
  return (
    <View style={styles.list}>
      {items.map((it) => {
        const when =
          stage === "sent"
            ? "Sent to your bank"
            : stage === "paused"
              ? "After the safety pause"
              : it.tier === 1
                ? "Now"
                : `After your PIN and a ${holdSeconds}-second pause`;
        return (
          <Row key={`${it.vaultId}-${it.tier}`} gap={space.sm} style={styles.line}>
            <VaultGlyph category={it.category} size={36} />
            <View accessible accessibilityLabel={`${it.vaultName}, ${fmt(it.amount, currency)}, ${when}`} style={styles.flex}>
              <Txt v="labelL" numberOfLines={1}>
                {it.vaultName}
              </Txt>
              <Txt v="caption" color="textMuted">
                {when}
              </Txt>
            </View>
            <MoneyText value={it.amount} currency={currency} v="numM" />
          </Row>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  line: { minHeight: layout.hit },
  flex: { flex: 1, gap: 2 },
});
