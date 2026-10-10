import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CheckCircleIcon, WarningCircleIcon } from "@/components/icons";
import { Button, Card, MoneyText, Press, Row, Txt, VaultGlyph } from "@/components/ui";
import type { PaymentIntent } from "@/lib/api/pay-types";
import { categoryOf } from "@/lib/categories";
import { layout, space, useTheme } from "@/theme";
import { midSentence, payAmount } from "../format";
import { billWord, type PayVault } from "./vaults";

/** Which vault pays, why it matched, and whether it has enough. "Change" opens the picker. */
export function PayFromCard({ intent, vault, canChange, onChange }: { intent: PaymentIntent; vault: PayVault | null; canChange: boolean; onChange: () => void }) {
  const { c } = useTheme();
  const category = categoryOf(intent.category);
  if (!vault)
    return (
      <Card>
        <Txt v="labelM" color="textMuted">
          Pay from
        </Txt>
        <Row gap={8} style={styles.top}>
          <WarningCircleIcon size={20} color={c.warning} weight="fill" />
          <Txt v="bodyM" style={styles.flex}>
            None of your vaults covers {billWord(intent.category)} bills, so this can&apos;t be paid from Vaultwise yet.
          </Txt>
        </Row>
        <Button
          label={`Start a ${category.label} vault`}
          variant="tonal"
          size="md"
          // Opened over the checkout: the new vault starts on this bill's category, and finishing comes back here.
          onPress={() => router.push({ pathname: "/new-vault", params: { from: "checkout", category: intent.category } })}
        />
      </Card>
    );

  const short = vault.available < intent.amount;
  return (
    <Card>
      <Row style={styles.head}>
        <Txt v="labelM" color="textMuted">
          Pay from
        </Txt>
        {canChange ? (
          <Press onPress={onChange} hitSlop={8} style={styles.change} accessibilityLabel={`Change vault. Paying from ${vault.name}`}>
            <Txt v="labelM" color="accent">
              Change
            </Txt>
          </Press>
        ) : null}
      </Row>
      <Row gap={space.sm}>
        <VaultGlyph category={vault.category} size={44} />
        <View style={styles.flex}>
          <Txt v="labelL" numberOfLines={2}>
            {vault.name}
          </Txt>
          <Row gap={4}>
            <MoneyText v="numS" value={vault.available} currency={intent.currency} color={c.textMuted} />
            <Txt v="caption" color="textMuted">
              available
            </Txt>
          </Row>
        </View>
      </Row>
      <Row gap={8} style={styles.top}>
        <CheckCircleIcon size={18} color={c.success} weight="fill" />
        <Txt v="bodyM" style={styles.flex}>
          Matched: {category.label} — {midSentence(intent.description)}
        </Txt>
      </Row>
      {short ? (
        <>
          <Row gap={8} style={styles.top}>
            <WarningCircleIcon size={18} color={c.warning} weight="fill" />
            <Txt v="bodyM" style={styles.flex}>
              Not enough available. This bill is {payAmount(intent.amount, intent.currency)}.
            </Txt>
          </Row>
          <Button
            label={`Add money to ${vault.name}`}
            variant="tonal"
            size="md"
            onPress={() => router.push(`/add-money/${vault.id}`)}
          />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { justifyContent: "space-between", minHeight: layout.hit },
  change: { minHeight: layout.hit, minWidth: layout.hit, justifyContent: "center", alignItems: "flex-end", paddingHorizontal: 4 },
  top: { alignItems: "flex-start" },
  flex: { flex: 1 },
});
