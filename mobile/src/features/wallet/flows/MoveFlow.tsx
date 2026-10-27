import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { LockIcon, WalletIcon } from "@/components/icons";
import {
  Amount,
  Banner,
  Button,
  Card,
  Celebration,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  ModalScreen,
  PracticeBadge,
  Press,
  ProgressBar,
  Stack,
  Skeleton,
  Txt,
  useHardwareBack,
  VaultGlyph,
} from "@/components/ui";
import { CoinDrop } from "@/features/vaults/CoinDrop";
import { KeypadFooter, TypedAmount } from "@/features/vaults/fields";
import { milestoneLevel, progressOf } from "@/features/vaults/format";
import { MILESTONE_TITLE, recordMilestone } from "@/features/vaults/hooks";
import { ReleaseContract } from "@/features/vaults/ReleaseContract";
import { api } from "@/lib/api/client";
import { useInvalidateMoney, useVaults } from "@/lib/api/hooks";
import type { Vault } from "@/lib/api/types";
import type { Wallet } from "@/lib/api/wallet-types";
import { categoryOf, emoji3d } from "@/lib/categories";
import { haptic } from "@/lib/haptics";
import { moneyWhole, parseAmount } from "@/lib/money";
import { layout, radius, space, useTheme } from "@/theme";
import { amountText, moveUnconfirmed, outgoingProblem } from "../model";
import { CheckWalletButton, closeFlow, FlowLine, MoveFailed, PlaceCard, toWallet, useMoveFailure } from "./parts";

type Step = "pick" | "amount" | "confirm" | "done";

interface Moved {
  vault: Vault;
  amount: number;
  before: number;
  after: number;
  crossed: number | null;
  wallet: number;
}

/**
 * Move to a vault: wallet → vault (never the other way; vaults release only against proof).
 * Pick the vault → amount → confirm with the vault's release contract → the coin drops in, with
 * `deposit.coinDrop` on impact. Saving, so a crossed milestone is celebrated.
 */
export function MoveFlow({ wallet, vaultId }: { wallet: Wallet; vaultId?: string }) {
  const vaults = useVaults();
  const invalidate = useInvalidateMoney();
  const failed = useMoveFailure();
  const [chosen, setChosen] = useState<string | null>(vaultId ?? null);
  const [step, setStep] = useState<Step>(vaultId ? "amount" : "pick");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [moved, setMoved] = useState<Moved | null>(null);

  const open = vaults.data?.vaults.filter((v) => v.status !== "closed");
  const vault = open?.find((v) => v.id === chosen);
  const cur = wallet.currency;
  const minor = parseAmount(value) ?? 0;
  const problem = outgoingProblem(minor, wallet, false);
  // No answer came: the money may have moved, so the way on is the wallet, not this move again.
  const unsure = moveUnconfirmed(error);

  useHardwareBack(
    submitting ? "block" : unsure ? toWallet : step === "confirm" ? () => setStep("amount") : step === "amount" && !vaultId ? () => setStep("pick") : null,
  );

  const type = (next: string) => {
    if (outgoingProblem(parseAmount(next), wallet, false) && !problem) haptic("warning");
    setValue(next);
  };

  const submit = async () => {
    if (!vault || !minor || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.walletMove(vault.id, minor / 100);
      const after = vault.balance + minor;
      // Record the new quarter before refreshing, so the vault screen behind doesn't celebrate too.
      const crossed = await recordMilestone(vault.id, progressOf(after, vault.target), milestoneLevel(vault.progress));
      setMoved({ vault, amount: minor, before: vault.balance, after, crossed, wallet: res?.wallet?.balance ?? wallet.balance - minor });
      setStep("done");
      void invalidate();
    } catch (e) {
      failed(e);
      setError(e);
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "done" && moved) return <Landed moved={moved} currency={cur} />;

  if (step === "pick" || !vault)
    return (
      <ModalScreen title="Move to a vault">
        <PickVault
          vaults={open}
          loading={vaults.isPending}
          error={vaults.isError ? vaults.error : null}
          onRetry={() => void vaults.refetch()}
          missing={step !== "pick" && !vaults.isPending && !vault}
          currency={cur}
          onPick={(v) => {
            setChosen(v.id);
            setStep("amount");
          }}
        />
      </ModalScreen>
    );

  if (step === "confirm")
    return (
      <ModalScreen
        title="Move to a vault"
        onClose={unsure ? toWallet : undefined}
        back={
          unsure
            ? undefined
            : () => {
                if (!submitting) setStep("amount");
              }
        }
        footer={unsure ? <CheckWalletButton /> : <Button key="confirm" label={`Move ${amountText(minor, cur)}`} onPress={() => void submit()} loading={submitting} armOnMount />}
      >
        <ConfirmMove vault={vault} amount={minor} wallet={wallet} error={error} />
      </ModalScreen>
    );

  return (
    <ModalScreen
      title="Move to a vault"
      back={vaultId ? undefined : () => setStep("pick")}
      footer={
        <KeypadFooter
          stepKey="amount"
          value={value}
          onChange={type}
          label="Continue"
          disabled={!minor || !!problem}
          onPress={() => {
            setError(null);
            setStep("confirm");
          }}
        />
      }
    >
      <PracticeBadge />
      <Destination vault={vault} onChange={vaultId ? undefined : () => setStep("pick")} />
      <TypedAmount value={value} currency={cur} caption={`Move to ${vault.name}`} />
      <PlaceCard icon={WalletIcon} title="From your wallet" line={`${amountText(wallet.balance, cur)} there now`} />
      {problem ? <Banner tone="warning" title={problem.title} body={problem.body} /> : null}
    </ModalScreen>
  );
}

function PickVault({
  vaults,
  loading,
  error,
  onRetry,
  missing,
  currency,
  onPick,
}: {
  vaults: Vault[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  missing: boolean;
  currency: string;
  onPick: (v: Vault) => void;
}) {
  if (loading)
    return (
      <Stack gap={space.sm}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={64} r={radius.md} />
        ))}
      </Stack>
    );
  if (error) return <ErrorState variant="calm" error={error} onRetry={onRetry} title="Your vaults didn't load" />;
  if (!vaults?.length)
    return (
      <EmptyState
        title="No vaults yet"
        body="Make a vault first, then move money into it."
        action="New vault"
        onAction={() => router.replace("/new-vault")}
      />
    );
  return (
    <Stack gap={space.md}>
      <PracticeBadge />
      {missing ? <Banner tone="info" title="That vault isn't here" body="It may have been closed. Choose another one." /> : null}
      <Txt v="headline" accessibilityRole="header">
        Which vault?
      </Txt>
      <Txt v="bodyM" color="textMuted">
        Money you move locks in the vault. It comes out only against a matching bill or through emergency access.
      </Txt>
      <View>
        {vaults.map((v, i) => (
          <View key={v.id}>
            {i > 0 ? <Divider /> : null}
            <ListRow
              leading={<VaultGlyph category={v.category} />}
              title={v.name}
              subtitle={`${moneyWhole(v.balance, v.currency || currency)} of ${moneyWhole(v.target, v.currency || currency)}`}
              onPress={() => onPick(v)}
              accessibilityLabel={`${v.name}, ${categoryOf(v.category).label} vault, ${moneyWhole(v.balance, v.currency || currency)} of ${moneyWhole(v.target, v.currency || currency)}`}
            />
          </View>
        ))}
      </View>
    </Stack>
  );
}

function Destination({ vault, onChange }: { vault: Vault; onChange?: () => void }) {
  return (
    <View style={styles.destination}>
      <VaultGlyph category={vault.category} size={40} />
      <View style={styles.flex}>
        <Txt v="caption" color="textMuted">
          Into
        </Txt>
        <Txt v="labelL">{vault.name}</Txt>
      </View>
      {onChange ? (
        <Press onPress={onChange} accessibilityLabel="Change vault" hitSlop={8} style={styles.change}>
          <Txt v="labelM" color="accent">
            Change
          </Txt>
        </Press>
      ) : null}
    </View>
  );
}

function ConfirmMove({ vault, amount, wallet, error }: { vault: Vault; amount: number; wallet: Wallet; error: unknown }) {
  const { c } = useTheme();
  const cur = wallet.currency;
  const after = vault.balance + amount;
  const pct = Math.round(progressOf(after, vault.target) * 100);
  return (
    <>
      <PracticeBadge />
      <Txt v="titleM" color="textMuted" align="center" accessibilityRole="header">
        You&apos;re moving
      </Txt>
      <Amount value={amount} currency={cur} size="xl" align="center" animate={false} />
      {error ? <MoveFailed error={error} /> : null}
      <Card>
        <FlowLine label="From" value="Your wallet" />
        <Divider />
        <FlowLine label="To" value={vault.name} />
        <Divider />
        <FlowLine label="Vault after this" value={`${moneyWhole(after, cur)} of ${moneyWhole(vault.target, cur)} · ${pct}%`} />
        <Divider />
        <FlowLine label="Wallet after this" value={amountText(wallet.balance - amount, cur)} />
      </Card>
      <View style={styles.lockNote}>
        <LockIcon size={18} color={c.textMuted} />
        <Txt v="bodyM" color="textMuted" style={styles.flex}>
          Once it&apos;s in, it stays locked. It can&apos;t go back to your wallet.
        </Txt>
      </View>
      <ReleaseContract category={vault.category} template={vault.template} customRule={vault.customRule} showSupportLink={false} />
    </>
  );
}

/** The saving moment: the coin lands in the vault's object, then a milestone if one was crossed. */
function Landed({ moved, currency }: { moved: Moved; currency: string }) {
  const { cat } = useTheme();
  const { vault, amount, before, after, crossed } = moved;
  const meta = categoryOf(vault.category);
  const [play, setPlay] = useState(false);
  const [landed, setLanded] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setPlay(true), 250);
    return () => clearTimeout(t);
  }, []);
  // If the animation is ever interrupted, still show the new balance (without the impact haptic).
  useEffect(() => {
    if (!play || landed) return;
    const t = setTimeout(() => setLanded(true), 1500);
    return () => clearTimeout(t);
  }, [play, landed]);
  useEffect(() => {
    if (!landed || !crossed) return;
    const t = setTimeout(() => setCelebrating(true), 700);
    return () => clearTimeout(t);
  }, [landed, crossed]);

  const onImpact = useCallback(() => {
    haptic("deposit.coinDrop");
    setLanded(true);
  }, []);
  const endCelebration = useCallback(() => setCelebrating(false), []);

  const shown = landed ? after : before;
  const progress = progressOf(shown, vault.target);
  const toGo = Math.max(0, vault.target - shown);

  return (
    <View style={styles.flex}>
      <ModalScreen title="Move to a vault" onClose={closeFlow} footer={<Button key="done" label="Done" onPress={closeFlow} armOnMount />}>
        <PracticeBadge />
        <CoinDrop object={emoji3d[meta.key]} play={play} onImpact={onImpact} />
        <View style={styles.saved} accessibilityLiveRegion="polite">
          <Txt v="headline" align="center" accessibilityRole="header">
            Saved
          </Txt>
          <Txt v="bodyL" color="textMuted" align="center">
            {amountText(amount, currency)} is locked in {vault.name}. Your wallet has {amountText(moved.wallet, currency)} left.
          </Txt>
        </View>
        <Card>
          <Amount value={shown} currency={currency} size="l" />
          <ProgressBar value={progress} color={cat(meta.key).tint} label={`${Math.round(progress * 100)}% of the goal`} />
          <Txt v="bodyM" color="textMuted">
            {progress >= 1
              ? `Goal of ${moneyWhole(vault.target, currency)} reached`
              : `${Math.round(progress * 100)}% of ${moneyWhole(vault.target, currency)} · ${moneyWhole(toGo, currency)} to go`}
          </Txt>
        </Card>
      </ModalScreen>
      {crossed ? (
        <Celebration
          visible={celebrating}
          kind={crossed === 4 ? "reached" : "milestone"}
          image={emoji3d[meta.key]}
          title={MILESTONE_TITLE[crossed]}
          body={`${moneyWhole(after, currency)} saved in ${vault.name}`}
          onDone={endCelebration}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  destination: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: layout.rowMin },
  change: { minHeight: layout.hit, justifyContent: "center", paddingHorizontal: 4 },
  lockNote: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  saved: { alignItems: "center", gap: space.xs },
});
