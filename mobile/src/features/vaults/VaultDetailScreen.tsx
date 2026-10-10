import { useState } from "react";
import { Linking, StyleSheet, useWindowDimensions, View } from "react-native";
import { router, useIsFocused } from "expo-router";
import { ArrowLeftIcon, ArrowUpRightIcon, DotsThreeIcon, ExportIcon, PencilSimpleIcon, PlusIcon, TrashIcon, UsersIcon } from "@/components/icons";
import { Banner, Button, Card, Celebration, EmptyState, ErrorState, Press, Screen, ScreenSkeleton, SectionHeader, Stack, Txt } from "@/components/ui";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { useConnection, useVault } from "@/lib/api/hooks";
import type { VaultDetail } from "@/lib/api/types";
import { categoryOf, emoji3d } from "@/lib/categories";
import { moneyWhole } from "@/lib/money";
import { layout, space, useTheme } from "@/theme";
import { ActionMenu, Dialog } from "./Dialog";
import { EditVaultModal, type EditTab } from "./EditVaultModal";
import { formatDate } from "./format";
import { HistoryList } from "./HistoryList";
import { MILESTONE_TITLE, useMilestoneWatch } from "./hooks";
import { MembersList } from "./MembersList";
import { ReleaseContract } from "./ReleaseContract";
import { RuleCard } from "./RuleCard";
import { Sparkline } from "./Sparkline";
import { VaultHero } from "./VaultHero";
import { WithdrawalList } from "./WithdrawalList";

type DialogKind = "close" | "members" | "export" | "exportFailed";

/** Vault detail (pushed; the tab bar stays visible). */
export function VaultDetailScreen({ id }: { id: string }) {
  const q = useVault(id);
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState<EditTab | null>(null);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const focused = useIsFocused();
  const exportStatement = useExport();
  const milestone = useMilestoneWatch(q.data?.vault, focused && !edit);
  const header = <DetailHeader onMenu={q.data ? () => setMenu(true) : undefined} />;

  if (!q.data && !q.isError)
    return (
      <Screen header={header}>
        <ScreenSkeleton />
      </Screen>
    );
  if (!q.data) {
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return (
      <Screen header={header} onRefresh={() => q.refetch()}>
        {missing ? (
          <EmptyState
            image={emoji3d.locked}
            title="This vault isn't here"
            body="It may have been closed. Your other vaults are on the Vaults tab."
            action="See all vaults"
            onAction={() => router.dismissTo("/vaults")}
          />
        ) : (
          <ErrorState error={q.error} onRetry={() => q.refetch()} title="This vault didn't load" />
        )}
      </Screen>
    );
  }

  const detail = q.data;
  const { vault } = detail;
  const meta = categoryOf(vault.category);

  return (
    <View style={{ flex: 1 }}>
      <Screen header={header} onRefresh={() => q.refetch()}>
        {q.isError ? <Banner tone="warning" title="Couldn't refresh" body="Showing this vault as it was. Pull down to try again." /> : null}
        <VaultHero vault={vault} />
        <ActionRow vaultId={vault.id} available={vault.available} held={vault.held} currency={vault.currency} />
        <ReleaseContract category={vault.category} template={vault.template} />
        {detail.withdrawals.length ? (
          <Stack gap={0}>
            <SectionHeader title="Withdrawals" />
            <WithdrawalList rows={detail.withdrawals} currency={detail.currency} />
          </Stack>
        ) : null}
        {vault.isJoint ? (
          <Stack gap={0}>
            <SectionHeader title="Members" />
            <MembersList members={vault.members} currency={vault.currency} you={detail.userName} />
          </Stack>
        ) : null}
        <RuleCard vault={vault} onEdit={() => setEdit("rule")} />
        <BalanceCard detail={detail} />
        <Stack gap={0}>
          <SectionHeader title="History" />
          {detail.history.length ? (
            <HistoryList lines={detail.history} />
          ) : (
            <Txt v="bodyM" color="textMuted">
              Nothing in yet. Money you add shows here.
            </Txt>
          )}
        </Stack>
      </Screen>

      <ActionMenu
        visible={menu}
        onDismiss={() => setMenu(false)}
        items={[
          { label: "Edit goal & rule", icon: PencilSimpleIcon, onPress: () => setEdit("goal") },
          ...(vault.isJoint ? [{ label: "Members", icon: UsersIcon, onPress: () => setDialog("members") }] : []),
          { label: "Export statement", icon: ExportIcon, onPress: () => exportStatement((kind) => setDialog(kind)) },
          { label: "Close vault", icon: TrashIcon, destructive: true, onPress: () => setDialog("close") },
        ]}
      />
      <VaultDialogs kind={dialog} detail={detail} onDismiss={() => setDialog(null)} />
      {edit ? <EditVaultModal vault={vault} initialTab={edit} onClose={() => setEdit(null)} /> : null}
      <Celebration
        visible={milestone.level !== null}
        kind={milestone.level === 4 ? "reached" : "milestone"}
        image={emoji3d[meta.key]}
        title={MILESTONE_TITLE[milestone.level ?? 1]}
        body={`${moneyWhole(vault.balance, vault.currency)} saved in ${vault.name}`}
        onDone={milestone.dismiss}
      />
    </View>
  );
}

/** Live: opens the statement export in the browser. Demo has no server to export from. */
function useExport() {
  const { mode } = useConnection();
  return (explain: (kind: "export" | "exportFailed") => void) => {
    const url = mode === "live" ? api.exportUrl() : "";
    if (!url) return explain("export");
    Linking.openURL(url).catch(() => explain("exportFailed"));
  };
}

function DetailHeader({ onMenu }: { onMenu?: () => void }) {
  const { c } = useTheme();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/vaults"));
  return (
    <View style={styles.header}>
      <Press onPress={back} accessibilityLabel="Back" hitSlop={8} style={[styles.headerBtn, { backgroundColor: c.surfaceRaised }]}>
        <ArrowLeftIcon size={22} color={c.text} weight="bold" />
      </Press>
      {onMenu ? (
        <Press onPress={onMenu} accessibilityLabel="More options" hitSlop={8} style={[styles.headerBtn, { backgroundColor: c.surfaceRaised }]}>
          <DotsThreeIcon size={24} color={c.text} weight="bold" />
        </Press>
      ) : null}
    </View>
  );
}

/** Two equal 56 pt buttons directly under the hero (no sticky bar). Stacks at large text sizes. */
function ActionRow({ vaultId, available, held, currency }: { vaultId: string; available: number; held: number; currency: string }) {
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.35;
  const canWithdraw = available > 0;
  return (
    <View style={{ gap: space.xs }}>
      <View style={[styles.actions, stacked && styles.actionsStacked]}>
        <Button
          label="Add money"
          variant="tonal"
          icon={PlusIcon}
          onPress={() => router.push(`/add-money/${vaultId}`)}
          style={stacked ? undefined : styles.actionBtn}
        />
        <Button
          label="Withdraw"
          icon={ArrowUpRightIcon}
          disabled={!canWithdraw}
          onPress={() => router.push(`/withdraw/${vaultId}`)}
          style={stacked ? undefined : styles.actionBtn}
          accessibilityHint="Asks for a matching bill before the money is released"
        />
      </View>
      {held > 0 ? (
        <Txt v="caption" color="textMuted" align="center">
          {moneyWhole(held, currency)} held for a pending withdrawal · {moneyWhole(available, currency)} available
        </Txt>
      ) : !canWithdraw ? (
        <Txt v="caption" color="textMuted" align="center">
          Nothing to withdraw yet.
        </Txt>
      ) : null}
    </View>
  );
}

function BalanceCard({ detail }: { detail: VaultDetail }) {
  const { cat } = useTheme();
  const series = detail.series;
  if (series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  const tint = cat(detail.vault.category).tint;
  return (
    <Card>
      <View style={styles.balanceHead}>
        <Txt v="titleM" accessibilityRole="header">
          Balance
        </Txt>
        <Txt v="caption" color="textMuted">
          Since {formatDate(first.t)}
        </Txt>
      </View>
      <Sparkline
        points={series}
        color={tint}
        label={`Balance went from ${moneyWhole(first.balance, detail.currency)} on ${formatDate(first.t)} to ${moneyWhole(last.balance, detail.currency)} on ${formatDate(last.t)}`}
      />
    </Card>
  );
}

function VaultDialogs({ kind, detail, onDismiss }: { kind: DialogKind | null; detail: VaultDetail; onDismiss: () => void }) {
  const { vault } = detail;
  const toSupport = () => {
    onDismiss();
    router.push("/support");
  };
  return (
    <>
      <Dialog
        visible={kind === "close"}
        title="Close this vault?"
        body="Closing needs every balance withdrawn first, so a person handles it with you. They'll check what's left and where it goes."
        onDismiss={onDismiss}
        actions={[
          { label: "Talk to a person", variant: "primary", onPress: toSupport },
          { label: "Not now", variant: "tonal", onPress: onDismiss },
        ]}
      />
      <Dialog
        visible={kind === "members"}
        title="Members"
        body="Only members see this vault and what each person adds. To add or remove someone, talk to a person."
        onDismiss={onDismiss}
        actions={[
          { label: "Talk to a person", variant: "tonal", onPress: toSupport },
          { label: "Done", variant: "primary", onPress: onDismiss },
        ]}
      >
        <MembersList members={vault.members} currency={vault.currency} you={detail.userName} />
      </Dialog>
      <Dialog
        visible={kind === "export"}
        title="No statement to export"
        body="Statements come from the Vaultwise server. In Practice mode with sample data there isn't one to download."
        onDismiss={onDismiss}
        actions={[{ label: "OK", variant: "primary", onPress: onDismiss }]}
      />
      <Dialog
        visible={kind === "exportFailed"}
        title="The statement didn't open"
        body="Your browser couldn't open it. Check your connection and try again."
        onDismiss={onDismiss}
        actions={[{ label: "OK", variant: "primary", onPress: onDismiss }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.hit, paddingTop: space.xs },
  headerBtn: { width: layout.hit, height: layout.hit, borderRadius: layout.hit / 2, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", gap: space.sm },
  actionsStacked: { flexDirection: "column" },
  actionBtn: { flex: 1 },
  balanceHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm },
});
