import { StyleSheet, View } from "react-native";
import { BellIcon, ChecksIcon } from "@/components/icons";
import { Button, EmptyState, Press, Skeleton, Txt, useNow } from "@/components/ui";
import { CalmError, Group } from "@/features/account/controls";
import { Page } from "@/features/account/layout";
import { relativeWhen } from "@/features/home/format";
import type { AlertItem } from "@/lib/api/security-types";
import { layout, space, useTheme } from "@/theme";
import { useAlerts, useMarkAlertsRead } from "./hooks";
import { ALERT_ICONS } from "./model";

/**
 * Alerts (plan 06): sign-ins, new and trusted devices, money going out, limits going up and MPIN
 * changes, newest first. Unread ones have a dot; opening one marks it read, and "Mark all as read"
 * does the rest. Polled every minute while the app is open (./hooks.ts).
 */
export function AlertsScreen() {
  const alerts = useAlerts();
  const markRead = useMarkAlertsRead();
  const now = useNow(60_000);
  const list = alerts.data?.alerts ?? [];
  const unread = alerts.data?.unread ?? 0;

  return (
    <Page title="Alerts" onRefresh={() => alerts.refetch()}>
      {alerts.isPending ? (
        <Group>
          <LoadingRow />
          <LoadingRow />
          <LoadingRow />
        </Group>
      ) : alerts.isError && !alerts.data ? (
        <CalmError error={alerts.error} title="Your alerts didn't load" onRetry={() => void alerts.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title="No alerts yet" body="Sign-ins, new devices, money going out and changes to your limits or MPIN show up here." />
      ) : (
        <>
          {unread > 0 ? (
            <View style={styles.actions}>
              <Txt v="labelM" color="textMuted">
                {unread === 1 ? "1 unread" : `${unread} unread`}
              </Txt>
              <Button
                label="Mark all as read"
                icon={ChecksIcon}
                variant="tonal"
                size="sm"
                haptic="select.tick"
                onPress={() => void markRead().catch(() => undefined)}
              />
            </View>
          ) : null}
          <Group>
            {list.map((a) => (
              <AlertRow key={a.id} alert={a} now={now} onOpen={a.readAt === null ? () => void markRead([a.id]).catch(() => undefined) : undefined} />
            ))}
          </Group>
        </>
      )}
      <Txt v="bodyM" color="textMuted">
        Security and money alerts are always on. When you allow notifications, they come to this phone too.
      </Txt>
    </Page>
  );
}

function AlertRow({ alert: a, now, onOpen }: { alert: AlertItem; now: number; onOpen?: () => void }) {
  const { c } = useTheme();
  const Icon = ALERT_ICONS[a.kind] ?? BellIcon;
  const unread = a.readAt === null;
  const when = a.createdAt ? relativeWhen(a.createdAt, now) : "";
  const label = `${unread ? "Unread. " : ""}${a.title}. ${a.body} ${when}.`;
  const inner = (
    <>
      <Icon size={24} color={c.text} weight={unread ? "fill" : "regular"} />
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Txt v="labelL" style={styles.flex}>
            {a.title}
          </Txt>
          {unread ? <View style={[styles.dot, { backgroundColor: c.accent }]} /> : null}
        </View>
        {a.body ? (
          <Txt v="bodyM" color="textMuted">
            {a.body}
          </Txt>
        ) : null}
        <Txt v="caption" color="textMuted">
          {when}
        </Txt>
      </View>
    </>
  );
  if (onOpen)
    return (
      <Press onPress={onOpen} scaleTo={0.99} accessibilityLabel={label} accessibilityHint="Marks it read" style={styles.row}>
        {inner}
      </Press>
    );
  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      {inner}
    </View>
  );
}

function LoadingRow() {
  return (
    <View style={styles.row}>
      <Skeleton width={24} height={24} />
      <View style={styles.text}>
        <Skeleton width="60%" />
        <Skeleton width="90%" height={14} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: space.sm, minHeight: layout.rowMin },
  text: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  flex: { flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
