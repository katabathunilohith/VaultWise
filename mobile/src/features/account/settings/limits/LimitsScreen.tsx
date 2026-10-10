import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Banner, Button, MoneyText, PracticeBadge, ProgressBar, ScreenSkeleton, StatusPill, Txt } from "@/components/ui";
import { useLimits } from "@/lib/api/hooks";
import type { LimitKey, LimitsOverview } from "@/lib/api/types";
import { moneyWhole } from "@/lib/money";
import { radius, space, useTheme } from "@/theme";
import { CalmError } from "../../controls";
import { Page } from "../../layout";
import { LimitEditor } from "./LimitEditor";
import { LIMITS, lowerBlocked, raiseBlocked, shortDate, type EditMode } from "./limitMeta";

/** Your limits (calm core): usage, bounds, lower any time, raise once a month after a scam check. */
export function LimitsScreen() {
  const q = useLimits();
  const [edit, setEdit] = useState<{ key: LimitKey; mode: EditMode } | null>(null);
  return (
    <Page title="Your limits" onRefresh={() => q.refetch()}>
      <View style={{ gap: space.xs }}>
        <PracticeBadge />
        <Txt v="bodyL">Limits cap how much can leave your vaults. Lowering one works straight away. You can raise a limit once a month.</Txt>
      </View>
      {q.isPending ? (
        <ScreenSkeleton />
      ) : q.isError ? (
        <CalmError error={q.error} onRetry={() => void q.refetch()} title="Your limits didn't load" />
      ) : (
        <Limits overview={q.data} onEdit={(key, mode) => setEdit({ key, mode })} />
      )}
      {edit && q.data ? (
        <LimitEditor key={`${edit.key}-${edit.mode}`} limitKey={edit.key} mode={edit.mode} overview={q.data} onClose={() => setEdit(null)} />
      ) : null}
    </Page>
  );
}

function Limits({ overview, onEdit }: { overview: LimitsOverview; onEdit: (key: LimitKey, mode: EditMode) => void }) {
  const { quota } = overview;
  const active = overview.active.length;
  return (
    <>
      <View style={styles.quota}>
        {quota.available ? (
          <StatusPill tone="success" label="Raise available this month" />
        ) : (
          <StatusPill tone="neutral" label={`Next raise from ${shortDate(quota.resetsAt)}`} />
        )}
      </View>
      {LIMITS.map((l) => (
        <LimitCard key={l.key} overview={overview} limitKey={l.key} title={l.title} body={l.body} onEdit={onEdit} />
      ))}
      {active > 0 ? (
        <Banner
          tone="info"
          title="A temporary raise is in place"
          body="It was approved for an emergency and ends on its own. Details are on the Vaultwise web app."
        />
      ) : null}
      <Banner
        tone="neutral"
        title="Need more for an emergency?"
        body={`Ask for a temporary raise on the Vaultwise web app. AI reads your request and a person checks anything unclear. ${overview.emergency.used} of ${overview.emergency.perMonth} requests used this month.`}
      />
    </>
  );
}

function LimitCard({
  overview,
  limitKey,
  title,
  body,
  onEdit,
}: {
  overview: LimitsOverview;
  limitKey: LimitKey;
  title: string;
  body: string;
  onEdit: (key: LimitKey, mode: EditMode) => void;
}) {
  const { c } = useTheme();
  const cur = overview.currency;
  const value = overview.limits[limitKey];
  const bounds = overview.bounds[limitKey];
  const raiseNote = raiseBlocked(overview, limitKey);
  const lowerNote = lowerBlocked(overview, limitKey);
  const daily = limitKey === "dailyWithdrawal";
  const used = overview.usage.withdrawnToday;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="titleM" accessibilityRole="header">
            {title}
          </Txt>
          <Txt v="bodyM" color="textMuted">
            {body}
          </Txt>
        </View>
        <MoneyText value={value} currency={cur} v="numL" />
      </View>
      {daily ? (
        <View style={{ gap: 6 }}>
          <ProgressBar
            value={value > 0 ? used / value : 0}
            color={c.textMuted}
            ticks={false}
            label={`${moneyWhole(used, cur)} of ${moneyWhole(value, cur)} used today`}
          />
          <Txt v="caption" color="textMuted">
            {`${moneyWhole(used, cur)} used today · ${moneyWhole(overview.usage.dailyRemaining, cur)} left`}
          </Txt>
        </View>
      ) : null}
      <Txt v="caption" color="textMuted">
        {`Can be set up to ${moneyWhole(bounds.max, cur)} in your country.`}
      </Txt>
      <View style={styles.actions}>
        <Button
          label="Lower"
          variant="tonal"
          size="md"
          disabled={!!lowerNote}
          onPress={() => onEdit(limitKey, "lower")}
          style={styles.action}
          accessibilityHint={lowerNote ?? undefined}
        />
        <Button
          label="Raise"
          variant="tonal"
          size="md"
          disabled={!!raiseNote}
          onPress={() => onEdit(limitKey, "raise")}
          style={styles.action}
          accessibilityHint={raiseNote ?? undefined}
        />
      </View>
      {raiseNote || lowerNote ? (
        <Txt v="caption" color="textMuted">
          {[lowerNote, raiseNote].filter(Boolean).join(" ")}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  quota: { flexDirection: "row" },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.sm },
  head: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.xxs },
  action: { flex: 1 },
});
