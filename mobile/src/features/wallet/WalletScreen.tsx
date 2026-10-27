import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { BankIcon, WalletIcon } from "@/components/icons";
import { Amount, Banner, Button, Card, ErrorState, MoneyText, PracticeBadge, Press, ProgressBar, ScreenSkeleton, SectionHeader, Txt, useNow } from "@/components/ui";
import { Group, RadioRow } from "@/features/account/controls";
import { Page } from "@/features/account/layout";
import { shortDate } from "@/features/home/format";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { AutoSaveSource, Wallet } from "@/lib/api/wallet-types";
import { haptic } from "@/lib/haptics";
import { radius, space, useTheme } from "@/theme";
import { useRefreshWallet, useWallet, walletMissing } from "./hooks";
import { amountText, limitLeft, MONEY_ACTIONS, moveUnconfirmed, paydayLine, safeToSpendNote, walletActionHref, walletRestricted } from "./model";
import { WalletOnHold } from "./OnHold";
import { WalletActivityList } from "./WalletActivityList";

/**
 * The wallet (pushed, calm core): what's in it, what's safe to spend today until payday, the four
 * money actions in the lower middle, the daily limit, where auto-saves come from, and recent moves.
 */
export function WalletScreen() {
  const q = useWallet();
  return (
    <Page title="Wallet" onRefresh={() => q.refetch()}>
      {q.data ? (
        <WalletBody wallet={q.data} />
      ) : q.isError && walletRestricted(q.error) ? (
        <WalletOnHold />
      ) : q.isError ? (
        <ErrorState
          variant="calm"
          title={walletMissing(q.error) ? "The wallet isn't available" : "Your wallet didn't load"}
          error={walletMissing(q.error) ? new Error("This Vaultwise server doesn't have a wallet yet.") : q.error}
          onRetry={walletMissing(q.error) ? undefined : () => void q.refetch()}
        />
      ) : (
        <ScreenSkeleton />
      )}
    </Page>
  );
}

function WalletBody({ wallet }: { wallet: Wallet }) {
  const now = useNow(60_000);
  const cur = wallet.currency;
  const short = wallet.autoSaveSource === "wallet" && wallet.upcomingFromWallet > wallet.balance;
  return (
    <>
      <View style={styles.hero}>
        <PracticeBadge />
        <Txt v="labelM" color="textMuted" accessibilityRole="header">
          In your wallet
        </Txt>
        <Amount value={wallet.balance} currency={cur} size="l" />
        <Txt v="bodyM" color="textMuted">
          Yours to spend. It isn&apos;t locked like money in a vault.
        </Txt>
      </View>

      {wallet.enabled ? (
        <Card>
          <Txt v="labelM" color="textMuted">
            Safe to spend today
          </Txt>
          <Amount value={wallet.safeToSpendToday} currency={cur} size="m" />
          <Txt v="bodyM">{paydayLine(wallet, now)}</Txt>
          <Txt v="caption" color="textMuted">
            {safeToSpendNote(wallet)}
          </Txt>
        </Card>
      ) : (
        <Banner tone="info" title="The wallet is off for now" body="You can still move the money in it to your bank." />
      )}

      {short ? (
        <Banner
          tone="warning"
          title="Not enough for your auto-saves"
          body={`${amountText(wallet.upcomingFromWallet, cur)} of auto-saves are due before payday. A save your wallet can't cover is skipped. Add money, or take them from your bank.`}
          action={{ label: "Add money", onPress: () => router.push(walletActionHref("add")) }}
        />
      ) : null}

      <Actions wallet={wallet} />

      {wallet.enabled ? <LimitCard wallet={wallet} now={now} /> : null}
      {wallet.enabled ? <AutoSaveSourceChoice wallet={wallet} /> : null}

      <SectionHeader title="Recent" />
      <Card>
        <WalletActivityList items={wallet.recent} currency={cur} now={now} />
      </Card>
    </>
  );
}

/** Add, move, pay, cash out: a 2 × 2 grid in the lower middle (R4). Labels wrap at large text. */
function Actions({ wallet }: { wallet: Wallet }) {
  const { c } = useTheme();
  const actions = wallet.enabled ? MONEY_ACTIONS : MONEY_ACTIONS.filter((a) => a.action === "cash-out");
  return (
    <View style={styles.grid}>
      {actions.map((a) => (
        <Press
          key={a.action}
          accessibilityLabel={a.label}
          accessibilityHint={a.hint}
          onPress={() => router.push(walletActionHref(a.action))}
          style={[styles.tile, { backgroundColor: c.surface, borderColor: c.border }]}
        >
          <a.icon size={26} color={c.text} />
          <Txt v="labelM" align="center">
            {a.label}
          </Txt>
        </Press>
      ))}
    </View>
  );
}

function LimitCard({ wallet, now }: { wallet: Wallet; now: number }) {
  const { c } = useTheme();
  const cur = wallet.currency;
  const left = limitLeft(wallet);
  const limit = wallet.dailyLimit;
  return (
    <Card>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          <Txt v="titleM" accessibilityRole="header">
            Daily spending limit
          </Txt>
          <Txt v="bodyM" color="textMuted">
            The most that can leave your wallet in a day, in payments and cash outs.
          </Txt>
        </View>
        {limit !== null ? (
          <MoneyText value={limit} currency={cur} v="numL" whole />
        ) : (
          <Txt v="labelL" color="textMuted">
            Off
          </Txt>
        )}
      </View>
      {limit !== null && left !== null ? (
        <View style={styles.usage}>
          <ProgressBar
            value={limit > 0 ? Math.min(1, wallet.spentToday / limit) : 0}
            color={c.textMuted}
            ticks={false}
            label={`${amountText(wallet.spentToday, cur)} of ${amountText(limit, cur)} used today`}
          />
          <Txt v="caption" color="textMuted">
            {`${amountText(wallet.spentToday, cur)} used today · ${amountText(left, cur)} left`}
          </Txt>
        </View>
      ) : null}
      {!wallet.limitRaiseAvailable && wallet.nextRaiseAt ? (
        <Txt v="caption" color="textMuted">
          {`You can raise it or turn it off again on ${shortDate(wallet.nextRaiseAt, now)}. You can lower it any time.`}
        </Txt>
      ) : null}
      <Button label={limit === null ? "Set a limit" : "Change limit"} variant="tonal" size="md" onPress={() => router.push(walletActionHref("limit"))} />
    </Card>
  );
}

/** Where fixed auto-saves come from. The change applies to the next one due. */
function AutoSaveSourceChoice({ wallet }: { wallet: Wallet }) {
  const refresh = useRefreshWallet();
  const [pending, setPending] = useState<AutoSaveSource | null>(null);
  const [error, setError] = useState<unknown>(null);
  const shown = pending ?? wallet.autoSaveSource;

  const choose = async (next: AutoSaveSource) => {
    if (pending || next === wallet.autoSaveSource) return;
    setPending(next);
    setError(null);
    try {
      await api.walletSettings({ autoSaveSource: next });
      await refresh();
    } catch (e) {
      haptic("error");
      setError(e);
      // It may have saved without the answer arriving: show what the wallet has now.
      if (moveUnconfirmed(e)) void refresh();
    } finally {
      setPending(null);
    }
  };

  return (
    <View style={styles.source}>
      <Group
        title="Auto-saves come from"
        note="Only fixed auto-saves follow this. Round-ups and percent-of-payday saves always come from your bank. A save your wallet can't cover is skipped."
      >
        <RadioRow
          icon={BankIcon}
          label="Your bank"
          description="Your vault rules take money from your bank, as they do now."
          selected={shown === "bank"}
          onPress={() => void choose("bank")}
        />
        <RadioRow
          icon={WalletIcon}
          label="Your wallet"
          description="Your vault rules take money from your wallet. Safe to spend keeps it covered."
          selected={shown === "wallet"}
          onPress={() => void choose("wallet")}
        />
      </Group>
      {error ? (
        moveUnconfirmed(error) ? (
          <Banner tone="warning" title="We couldn't confirm the change" body="The choice shown above is what your wallet has now." />
        ) : (
          <Banner tone="danger" title="That didn't save" body={`${errorMessage(error)} Nothing changed.`} />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.xs, paddingTop: space.xs },
  flex: { flex: 1, gap: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 76,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: space.xs,
    paddingVertical: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardHead: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", flexWrap: "wrap" },
  usage: { gap: 6 },
  source: { gap: space.sm },
});
