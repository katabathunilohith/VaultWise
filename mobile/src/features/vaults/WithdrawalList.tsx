import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CaretRightIcon } from "@/components/icons";
import { Banner, Button, Divider, MoneyText, Press, StatusPill, Txt } from "@/components/ui";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { useInvalidateMoney } from "@/lib/api/hooks";
import type { WithdrawalRow } from "@/lib/api/types";
import { haptic } from "@/lib/haptics";
import { money } from "@/lib/money";
import { layout, space, useTheme } from "@/theme";
import { Dialog } from "./Dialog";
import { useReleaseRules } from "./hooks";
import { formatWhen } from "./format";
import { isPending, withdrawalRule } from "./withdrawal-status";

const PAGE = 5;

/**
 * Pending and recent withdrawals. Every hold says what it's waiting for and when; a request still
 * waiting for its bill can get the bill added, or be cancelled (confirmed first). Rows with a proof
 * open its tracker.
 */
export function WithdrawalList({ rows, currency }: { rows: WithdrawalRow[]; currency: string }) {
  const [all, setAll] = useState(false);
  const [cancelling, setCancelling] = useState<WithdrawalRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateMoney();

  const sorted = [...rows].sort((a, b) => {
    const pa = isPending(a.status) ? 0 : 1;
    const pb = isPending(b.status) ? 0 : 1;
    return pa - pb || b.created_at - a.created_at;
  });
  const shown = all ? sorted : sorted.slice(0, PAGE);

  const dismiss = () => {
    if (!busy) setCancelling(null);
  };

  const confirmCancel = async () => {
    if (!cancelling || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelWithdrawal(cancelling.id);
      setCancelling(null);
      await invalidate();
    } catch (e) {
      haptic("error");
      setError(errorMessage(e));
      setCancelling(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.xs }}>
      {error ? (
        <Banner tone="danger" title="That didn't cancel" body={`${error} Nothing changed. Try again, or talk to a person below.`} />
      ) : null}
      {shown.map((w, i) => (
        <View key={w.id}>
          {i > 0 ? <Divider /> : null}
          <WithdrawalItem row={w} currency={currency} onCancel={() => setCancelling(w)} />
        </View>
      ))}
      {rows.length > PAGE ? (
        <Button label={all ? "Show fewer" : `Show all ${rows.length}`} variant="ghost" size="md" haptic={null} onPress={() => setAll((v) => !v)} />
      ) : null}
      <Dialog
        visible={!!cancelling}
        title="Cancel this request?"
        body={
          cancelling
            ? `${money(cancelling.amount, currency)}${cancelling.payee ? ` to ${cancelling.payee}` : ""} stops being held and is available in this vault again. You can ask again any time.`
            : undefined
        }
        onDismiss={dismiss}
        actions={[
          { label: "Cancel request", variant: "dangerOutline", onPress: confirmCancel, loading: busy },
          { label: "Keep it", variant: "tonal", onPress: dismiss },
        ]}
      />
    </View>
  );
}

function WithdrawalItem({ row, currency, onCancel }: { row: WithdrawalRow; currency: string; onCancel: () => void }) {
  const { c } = useTheme();
  const { reviewSlaHours } = useReleaseRules();
  const status = withdrawalRule(row.status);
  const proofId = row.proof_id;
  const actions = status.actions(row);
  const note = status.note(row, { reviewSlaHours });
  const label = `${row.payee || "Withdrawal"}, ${money(row.amount, currency)}, ${status.label}`;
  const addBill = () => router.push({ pathname: "/withdraw/[vaultId]", params: { vaultId: row.vault_id, withdrawalId: row.id } });
  const body = (
    <>
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="labelL" numberOfLines={1}>
            {row.payee || "Withdrawal"}
          </Txt>
          <Txt v="caption" color="textMuted">
            {formatWhen(row.created_at)}
          </Txt>
        </View>
        <MoneyText value={row.amount} currency={currency} />
        {proofId ? <CaretRightIcon size={18} color={c.textMuted} /> : null}
      </View>
      <StatusPill tone={status.tone} label={status.label} />
      {note ? (
        <Txt v="bodyM" color="textMuted">
          {note}
        </Txt>
      ) : null}
    </>
  );
  return (
    <View style={styles.item}>
      {proofId ? (
        <Press
          onPress={() => router.push(`/proof/${proofId}`)}
          scaleTo={0.99}
          accessibilityLabel={`${label}${note ? `. ${note}` : ""}`}
          accessibilityHint="Opens the tracker for this request"
          style={styles.body}
        >
          {body}
        </Press>
      ) : (
        <View style={styles.body} accessible accessibilityLabel={`${label}${note ? `. ${note}` : ""}`}>
          {body}
        </View>
      )}
      {actions.length ? (
        <View style={styles.actions}>
          {actions.includes("addBill") ? (
            <Button label="Add the bill" variant="tonal" size="sm" onPress={addBill} accessibilityHint="Opens the camera or your files for this request" />
          ) : null}
          {actions.includes("cancel") ? (
            <Button label="Cancel request" variant="ghost" size="sm" haptic={null} onPress={onCancel} accessibilityHint="Asks you to confirm first" />
          ) : null}
          {actions.includes("askPerson") ? (
            <Button label="Ask a person" variant="ghost" size="sm" haptic={null} onPress={() => router.push("/support")} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { paddingVertical: 10, gap: 4 },
  body: { gap: 6, minHeight: layout.rowMin },
  top: { flexDirection: "row", alignItems: "center", gap: space.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs, marginTop: 2 },
});
