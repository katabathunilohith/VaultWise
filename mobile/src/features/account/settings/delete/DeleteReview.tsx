import { StyleSheet, View } from "react-native";
import { ArrowRightIcon } from "@/components/icons";
import { Banner, Divider, MoneyText, PracticeBadge, Skeleton, Txt, VaultGlyph } from "@/components/ui";
import { useDashboard } from "@/lib/api/hooks";
import type { Dashboard } from "@/lib/api/types";
import { money } from "@/lib/money";
import { radius, space, useTheme } from "@/theme";
import { CalmError, CheckRow } from "../../controls";

/** What deleting does: each vault balance and where it goes, what's removed, and the acknowledgement. */
export function DeleteReview({ ack, onAck, demo }: { ack: boolean; onAck: (v: boolean) => void; demo: boolean }) {
  const dash = useDashboard();
  return (
    <>
      <View style={{ gap: space.xs }}>
        <PracticeBadge />
        <Txt v="headline" accessibilityRole="header">
          Before you delete
        </Txt>
        <Txt v="bodyL">Your account and every vault close, and your history is deleted. This can&apos;t be undone.</Txt>
      </View>

      {demo ? <Banner tone="info" title="You're using demo data" body="Deleting resets the sample data and this phone's settings. Nothing is sent anywhere." /> : null}

      <View style={{ gap: space.sm }}>
        <Txt v="titleM" accessibilityRole="header">
          Where your money goes
        </Txt>
        {dash.isPending ? (
          <View style={{ gap: space.sm }} accessibilityLabel="Loading your vaults">
            <Skeleton height={56} r={radius.md} />
            <Skeleton height={56} r={radius.md} />
          </View>
        ) : dash.isError ? (
          <CalmError error={dash.error} onRetry={() => void dash.refetch()} title="Your vaults didn't load" />
        ) : (
          <Balances dashboard={dash.data} />
        )}
      </View>

      <View style={{ gap: space.sm }}>
        <Txt v="titleM" accessibilityRole="header">
          What&apos;s deleted
        </Txt>
        <Bullet text="Your profile, vaults and saving rules." />
        <Bullet text="Your history, proofs and the documents you sent." />
        <Bullet text="Your limits and any requests in progress. Withdrawals waiting for proof are cancelled." />
        <Bullet text="From this phone: your PIN, app lock and choices like notifications." />
      </View>

      <Txt v="bodyM" color="textMuted">
        Want a copy first? Go back and choose Export my data. You can also delete your account from the web app.
      </Txt>

      <CheckRow label="I understand this can't be undone" checked={ack} onChange={onAck} />
    </>
  );
}

function Balances({ dashboard }: { dashboard: Dashboard }) {
  const { c } = useTheme();
  const cur = dashboard.currency;
  const vaults = dashboard.vaults;
  if (!vaults.length)
    return (
      <Txt v="bodyM" color="textMuted">
        You have no vaults, so there&apos;s no money to send back.
      </Txt>
    );
  const total = vaults.reduce((s, v) => s + v.balance, 0);
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      {vaults.map((v, i) => (
        <View key={v.id}>
          {i > 0 ? <Divider /> : null}
          <View style={styles.row} accessible accessibilityLabel={`${v.name}, ${money(v.balance, cur)}, goes back to your bank`}>
            <VaultGlyph category={v.category} size={36} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="labelL" numberOfLines={1}>
                {v.name}
              </Txt>
              <View style={styles.dest}>
                <ArrowRightIcon size={14} color={c.textMuted} />
                <Txt v="caption" color="textMuted">
                  Back to your bank
                </Txt>
              </View>
            </View>
            <MoneyText value={v.balance} currency={cur} />
          </View>
        </View>
      ))}
      <Divider />
      <View style={[styles.row, styles.total]} accessible accessibilityLabel={`Total back to your bank: ${money(total, cur)}`}>
        <Txt v="labelL" style={{ flex: 1 }}>
          Total back to your bank
        </Txt>
        <MoneyText value={total} currency={cur} v="numL" />
      </View>
      <Txt v="caption" color="textMuted" style={styles.note}>
        In Practice mode this is simulated. No real money moves.
      </Txt>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.bullet}>
      <View style={[styles.dot, { backgroundColor: c.textMuted }]} />
      <Txt v="bodyM" style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  dest: { flexDirection: "row", alignItems: "center", gap: 4 },
  total: { minHeight: 56 },
  note: { paddingBottom: space.md },
  bullet: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
});
