import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CaretRightIcon, HourglassIcon, ReceiptIcon, type Icon } from "@/components/icons";
import { Card, StatusPill, Txt, type Tone } from "@/components/ui";
import { useEmergency, useMe } from "@/lib/api/hooks";
import { radius, space, useTheme } from "@/theme";
import { dayChip } from "./format";

/**
 * Action-required items only (heatmap: badges and to-dos are for things that need you):
 * receipts owed after an emergency, and proofs still being checked. Hidden when there are none.
 */
export function TodoCards({ receiptsDue, reviewPending, now }: { receiptsDue: number; reviewPending: number; now: number }) {
  if (receiptsDue <= 0 && reviewPending <= 0) return null;
  return (
    <View style={styles.list}>
      <Txt v="labelM" color="textMuted" accessibilityRole="header">
        To do
      </Txt>
      {receiptsDue > 0 ? <ReceiptTodo count={receiptsDue} now={now} /> : null}
      {reviewPending > 0 ? <ReviewTodo count={reviewPending} /> : null}
    </View>
  );
}

function ReceiptTodo({ count, now }: { count: number; now: number }) {
  const em = useEmergency();
  const due = (em.data?.history ?? [])
    .filter((h) => (h.receiptStatus === "requested" || h.receiptStatus === "overdue") && h.receiptDueAt)
    .map((h) => h.receiptDueAt as number)
    .sort((a, b) => a - b)[0];
  const overdue = due !== undefined && due < now;
  const title = count === 1 ? "Add your emergency receipt" : `Add ${count} emergency receipts`;
  const body =
    due === undefined
      ? "The money's already with you. Add the bill to close this off."
      : overdue
        ? `This was due ${dayChip(due)}. Add the bill now, or ask a person for more time.`
        : `The money's already with you. Add the bill by ${dayChip(due)} to close this off.`;
  return (
    <TodoCard
      icon={ReceiptIcon}
      title={title}
      body={body}
      pill={overdue ? { tone: "warning", label: "Overdue" } : due !== undefined ? { tone: "neutral", label: `Due ${dayChip(due)}` } : undefined}
      onPress={() => router.push("/emergency")}
    />
  );
}

/**
 * `reviewPending` counts proofs still being decided: the automatic check, a person's review and
 * appeals alike, so the copy doesn't claim a person is looking at every one of them.
 */
function ReviewTodo({ count }: { count: number }) {
  const me = useMe();
  const hours = me.data?.onboarded ? me.data.rules.verification.reviewSlaHours : null;
  const title = count === 1 ? "Your proof is being checked" : `${count} proofs are being checked`;
  const body = `The money stays set aside until it's decided.${hours ? ` If a person checks it, usually within ${hours} hours.` : ""}`;
  return <TodoCard icon={HourglassIcon} title={title} body={body} pill={{ tone: "info", label: "Being checked" }} onPress={() => router.push("/vaults")} />;
}

function TodoCard({ icon: IconCmp, title, body, pill, onPress }: { icon: Icon; title: string; body: string; pill?: { tone: Tone; label: string }; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={`${title}. ${body}${pill ? ` ${pill.label}.` : ""}`}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: c.surfaceRaised }]}>
          <IconCmp size={22} color={c.text} />
        </View>
        <View style={styles.text}>
          <Txt v="labelL">{title}</Txt>
          <Txt v="bodyM" color="textMuted">
            {body}
          </Txt>
          {pill ? <StatusPill tone={pill.tone} label={pill.label} /> : null}
        </View>
        <CaretRightIcon size={18} color={c.textMuted} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  row: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  icon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 4 },
});
