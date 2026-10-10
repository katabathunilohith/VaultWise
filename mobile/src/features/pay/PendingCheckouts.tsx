import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CaretRightIcon } from "@/components/icons";
import { Card, MoneyText, Row, Skeleton, Stack, Txt, useNow } from "@/components/ui";
import type { PaymentIntent } from "@/lib/api/pay-types";
import { useDemoIntents } from "@/lib/api/hooks";
import { categoryOf } from "@/lib/categories";
import { money } from "@/lib/money";
import { radius, space, useTheme } from "@/theme";
import { CalmError } from "./CalmError";
import { MerchantAvatar } from "./MerchantAvatar";

/** "Waiting for you": checkouts a merchant has sent that still need the customer. */
export function PendingCheckouts() {
  const q = useDemoIntents();
  const now = useNow(30_000);
  if (q.isPending)
    return (
      <View accessible accessibilityLabel="Loading payments" style={styles.loading}>
        <Skeleton height={76} r={radius.lg} />
        <Skeleton height={76} r={radius.lg} />
      </View>
    );
  if (q.isError) return <CalmError title="Your payments didn't load" error={q.error} onRetry={() => void q.refetch()} />;
  const waiting = q.data.filter((i) => i.status === "requires_customer" && i.expiresAt > now);
  if (!waiting.length)
    return (
      <Card>
        <Txt v="labelL">Nothing waiting</Txt>
        <Txt v="bodyM" color="textMuted">
          When a merchant sends you a bill to pay from a vault, it shows up here.
        </Txt>
      </Card>
    );
  return (
    <Stack>
      {waiting.map((i) => (
        <PendingCard key={i.id} intent={i} />
      ))}
    </Stack>
  );
}

function PendingCard({ intent }: { intent: PaymentIntent }) {
  const { c, cat } = useTheme();
  const meta = categoryOf(intent.category);
  return (
    <Card
      onPress={() => router.push(`/checkout/${intent.id}`)}
      accessibilityLabel={`${intent.merchant.name}, ${money(intent.amount, intent.currency)}, ${meta.label}, ${intent.description}. Review and pay`}
      style={styles.card}
    >
      <MerchantAvatar name={intent.merchant.name} size={44} />
      <View style={styles.middle}>
        <Txt v="labelL" numberOfLines={1}>
          {intent.merchant.name}
        </Txt>
        <Row gap={6}>
          <meta.Icon size={16} color={cat(meta.key).tint} weight="duotone" />
          <Txt v="caption" color="textMuted" numberOfLines={1} style={styles.shrink}>
            {meta.short} · {intent.description}
          </Txt>
        </Row>
      </View>
      <Row gap={4}>
        <MoneyText value={intent.amount} currency={intent.currency} />
        <CaretRightIcon size={18} color={c.textMuted} />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  loading: { gap: space.sm },
  card: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 72 },
  middle: { flex: 1, gap: 2 },
  shrink: { flexShrink: 1 },
});
