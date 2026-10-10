import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CalendarBlankIcon, LockIcon, PlusIcon } from "@/components/icons";
import { Banner, Card, EmptyState, ErrorState, ListRow, PracticeBadge, Press, ProfileAvatar, Screen, ScreenSkeleton, SectionHeader, Stack, Txt } from "@/components/ui";
import { useVaults } from "@/lib/api/hooks";
import type { Vault } from "@/lib/api/types";
import { emoji3d } from "@/lib/categories";
import { moneyWhole } from "@/lib/money";
import { layout, space, useTheme } from "@/theme";
import { plural } from "./format";
import { NewVaultCard, VaultCard } from "./VaultCard";

/** Vaults tab root (expressive shell). Large title, avatar → settings, "+" → new vault. */
export function VaultsListScreen() {
  const q = useVaults();
  const vaults = q.data?.vaults ?? [];
  const currency = q.data?.currency ?? vaults[0]?.currency ?? "INR";
  const total = vaults.reduce((s, v) => s + v.balance, 0);
  const mine = vaults.filter((v) => !v.isJoint);
  const joint = vaults.filter((v) => v.isJoint);
  const grouped = mine.length > 0 && joint.length > 0;
  const hasAutoSaves = vaults.some((v) => v.rule.type !== "none");
  const open = (v: Vault) => router.push(`/vaults/${v.id}`);
  const create = () => router.push("/new-vault");

  return (
    <Screen onRefresh={() => q.refetch()} header={<RootHeader onCreate={create} />}>
      <View style={{ gap: space.xs }}>
        <Txt v="displayM" accessibilityRole="header">
          Vaults
        </Txt>
        {q.data ? (
          <Txt v="bodyL" color="textMuted">
            {vaults.length ? `${moneyWhole(total, currency)} across ${plural(vaults.length, "vault")}` : "Money set aside for one purpose each"}
          </Txt>
        ) : null}
        <PracticeBadge />
      </View>

      {q.isError && q.data ? (
        <Banner tone="warning" title="Couldn't refresh" body="Showing your vaults as they were. Pull down to try again." />
      ) : null}

      {!q.data ? (
        q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} title="Your vaults didn't load" />
        ) : (
          <ScreenSkeleton />
        )
      ) : vaults.length === 0 ? (
        <EmptyState
          image={emoji3d.locked}
          title="No vaults yet"
          body="A vault holds money for one purpose, like health or rent, and unlocks against a matching bill."
          action="New vault"
          onAction={create}
        />
      ) : (
        <>
          {grouped ? (
            <>
              <VaultGroup title="My vaults" vaults={mine} onOpen={open} />
              <VaultGroup title="Joint" vaults={joint} onOpen={open} />
            </>
          ) : (
            <VaultGroup vaults={vaults} onOpen={open} />
          )}
          <NewVaultCard onPress={create} />
          {hasAutoSaves ? (
            <Card>
              <ListRow
                icon={CalendarBlankIcon}
                title="Upcoming auto-saves"
                subtitle="See what's scheduled for the next 7 days. Skip one or pause them all."
                onPress={() => router.push("/upcoming")}
              />
            </Card>
          ) : null}
        </>
      )}

      <Footnote />
    </Screen>
  );
}

function VaultGroup({ title, vaults, onOpen }: { title?: string; vaults: Vault[]; onOpen: (v: Vault) => void }) {
  return (
    <Stack gap={space.sm}>
      {title ? <SectionHeader title={title} /> : null}
      {vaults.map((v) => (
        <VaultCard key={v.id} vault={v} onPress={() => onOpen(v)} />
      ))}
    </Stack>
  );
}

/** Tab-root header: avatar top-leading (settings), "+" top-trailing (new vault). */
function RootHeader({ onCreate }: { onCreate: () => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.header}>
      <ProfileAvatar />
      <Press onPress={onCreate} accessibilityLabel="New vault" hitSlop={8} style={[styles.headerBtn, { backgroundColor: c.surfaceRaised }]}>
        <PlusIcon size={22} color={c.text} weight="bold" />
      </Press>
    </View>
  );
}

function Footnote() {
  const { c } = useTheme();
  return (
    <View style={styles.footnote}>
      <LockIcon size={16} color={c.textMuted} />
      <Txt v="caption" color="textMuted" style={{ flex: 1 }}>
        Locked by default. Released against verified proof, or through emergency access.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.hit, paddingTop: space.xs },
  avatar: { width: layout.hit, height: layout.hit, borderRadius: layout.hit / 2, alignItems: "center", justifyContent: "center" },
  headerBtn: { width: layout.hit, height: layout.hit, borderRadius: layout.hit / 2, alignItems: "center", justifyContent: "center" },
  footnote: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 4 },
});
