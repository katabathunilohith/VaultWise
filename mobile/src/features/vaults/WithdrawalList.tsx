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
import { formatDeadline, formatWhen, PROOF_WINDOW_MS, withdrawalStatus } from "./format";

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
    const pa = withdrawalStatus(a.status).pending ? 0 : 1;
    const pb = withdrawalStatus(b.status).pending ? 0 : 1;
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

function rowNote(row: WithdrawalRow, reviewSlaHours: number): string | null {
  switch (row.status) {
    case "awaiting_proof": {
      const due = row.created_at + PROOF_WINDOW_MS;
      return due > Date.now()
        ? `Add the bill by ${formatDeadline(due)}.`
        : `The time to add the bill ended at ${formatDeadline(due)}. Cancel it to free the money, or ask a person.`;
    }
    case "verifying":
    case "processing":
      return "Checking the bill now. This usually takes a few seconds.";
    case "in_review":
      return `A person is checking the bill, usually within ${reviewSlaHours} hours.`;
    case "appealed":
      return `You asked a person to check it again. You'll usually hear back within ${reviewSlaHours} hours. The money stays held until then.`;
    case "denied":
      return `${row.decision_reason ? `${row.decision_reason} ` : ""}${row.proof_id ? "Open it to add another bill or ask a person to check." : "Ask a person to check."}`;
    case "expired":
      return "No bill arrived within 24 hours, so the money stayed in this vault.";
    default:
      return null;
  }
}

function WithdrawalItem({ row, currency, onCancel }: { row: WithdrawalRow; currency: string; onCancel: () => void }) {
  const { c } = useTheme();
  const { reviewSlaHours } = useReleaseRules();
  const status = withdrawalStatus(row.status);
  const proofId = row.proof_id;
  const awaiting = row.status === "awaiting_proof";
  const deniedWithoutProof = row.status === "denied" && !proofId;
  const note = rowNote(row, reviewSlaHours);
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
      {awaiting ? (
        <View style={styles.actions}>
          {proofId ? null : (
            <Button label="Add the bill" variant="tonal" size="sm" onPress={addBill} accessibilityHint="Opens the camera or your files for this request" />
          )}
          <Button label="Cancel request" variant="ghost" size="sm" haptic={null} onPress={onCancel} accessibilityHint="Asks you to confirm first" />
        </View>
      ) : deniedWithoutProof ? (
        <View style={styles.actions}>
          <Button label="Ask a person" variant="ghost" size="sm" haptic={null} onPress={() => router.push("/support")} />
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
