import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { BankIcon, LockIcon } from "@/components/icons";
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
  Skeleton,
  Stack,
  Txt,
  VaultGlyph,
} from "@/components/ui";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { useDashboard, useInvalidateMoney, useVaults } from "@/lib/api/hooks";
import type { Vault } from "@/lib/api/types";
import { categoryOf, emoji3d } from "@/lib/categories";
import { haptic } from "@/lib/haptics";
import { moneyWhole, parseAmount } from "@/lib/money";
import { layout, radius, space, useTheme } from "@/theme";
import { CoinDrop } from "./CoinDrop";
import { KeypadFooter, TypedAmount } from "./fields";
import { milestoneLevel, progressOf } from "./format";
import { MILESTONE_TITLE, recordMilestone } from "./hooks";
import { ReleaseContract } from "./ReleaseContract";

type Step = "pick" | "amount" | "confirm" | "done";

interface Deposit {
  vault: Vault;
  amount: number;
  before: number;
  after: number;
  crossed: number | null;
}

const close = () => (router.canGoBack() ? router.back() : router.replace("/vaults"));

/**
 * Add money (full-screen modal). `vaultId` "choose" starts with a vault picker. Amount on the
 * keypad (R8) → confirm → the coin drops into the vault, with `deposit.coinDrop` on impact.
 */
export function AddMoneyScreen({ vaultId }: { vaultId: string }) {
  const choosing = vaultId === "choose";
  const vaults = useVaults();
  const dash = useDashboard();
  const invalidate = useInvalidateMoney();
  const [chosen, setChosen] = useState<string | null>(choosing ? null : vaultId);
  const [step, setStep] = useState<Step>(choosing ? "pick" : "amount");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deposit, setDeposit] = useState<Deposit | null>(null);

  const vault = vaults.data?.vaults.find((v) => v.id === chosen);
  const bank = dash.data?.totals.bank ?? null;
  const minor = parseAmount(amount) ?? 0;
  const overBank = bank !== null && minor > bank;

  const typeAmount = (next: string) => {
    const nextMinor = parseAmount(next) ?? 0;
    // A safety limit engaged: say so once, as it's crossed, not on every key.
    if (bank !== null && nextMinor > bank && !overBank) haptic("warning");
    setAmount(next);
  };

  const submit = async () => {
    if (!vault || !minor) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.deposit(vault.id, minor / 100, "Added from your bank");
      const after = vault.balance + minor;
      // Record the new quarter before refreshing, so the vault screen behind doesn't celebrate too.
      const crossed = await recordMilestone(vault.id, progressOf(after, vault.target), milestoneLevel(vault.progress));
      setDeposit({ vault, amount: minor, before: vault.balance, after, crossed });
      setStep("done");
      void invalidate();
    } catch (e) {
      haptic("error");
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "done" && deposit) return <DoneStep deposit={deposit} />;

  if (step === "pick")
    return (
      <ModalScreen title="Add money">
        <PickStep
          vaults={vaults.data?.vaults}
          loading={vaults.isPending}
          error={vaults.isError ? vaults.error : null}
          onRetry={() => vaults.refetch()}
          onPick={(v) => {
            setChosen(v.id);
            setStep("amount");
          }}
        />
      </ModalScreen>
    );

  if (!vault)
    return (
      <ModalScreen title="Add money">
        {vaults.isPending ? (
          <Stack gap={space.md}>
            <Skeleton height={56} r={radius.md} />
            <Skeleton height={64} width="60%" />
            <Skeleton height={72} r={radius.lg} />
          </Stack>
        ) : vaults.isError ? (
          <ErrorState error={vaults.error} onRetry={() => vaults.refetch()} title="Your vaults didn't load" />
        ) : (
          <EmptyState
            image={emoji3d.locked}
            title="This vault isn't here"
            body="It may have been closed. Choose another vault to add to."
            action="Choose a vault"
            onAction={() => {
              setChosen(null);
              setStep("pick");
            }}
          />
        )}
      </ModalScreen>
    );

  const toPicker = choosing ? () => setStep("pick") : undefined;

  if (step === "confirm")
    return (
      <ModalScreen
        title="Add money"
        back={() => {
          if (!submitting) setStep("amount");
        }}
        footer={<Button key="confirm" label={`Add ${moneyWhole(minor, vault.currency)}`} onPress={submit} loading={submitting} armOnMount />}
      >
        <ConfirmStep vault={vault} amount={minor} error={error} />
      </ModalScreen>
    );

  return (
    <ModalScreen
      title="Add money"
      back={toPicker}
      footer={
        <KeypadFooter
          stepKey="amount"
          value={amount}
          onChange={typeAmount}
          label="Continue"
          disabled={!minor || overBank}
          onPress={() => {
            setError(null);
            setStep("confirm");
          }}
        />
      }
    >
      <PracticeBadge />
      <Destination vault={vault} onChange={toPicker} />
      <TypedAmount value={amount} currency={vault.currency} caption={`Add to ${vault.name}`} />
      <Source bank={bank} loading={dash.isPending} currency={vault.currency} />
      {overBank && bank !== null ? (
        <Banner tone="warning" title="More than your bank has" body={`Your bank has ${moneyWhole(bank, vault.currency)}. Try a smaller amount.`} />
      ) : null}
    </ModalScreen>
  );
}

function PickStep({
  vaults,
  loading,
  error,
  onRetry,
  onPick,
}: {
  vaults: Vault[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
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
  if (error) return <ErrorState error={error} onRetry={onRetry} title="Your vaults didn't load" />;
  if (!vaults?.length)
    return (
      <EmptyState
        image={emoji3d.locked}
        title="No vaults yet"
        body="Make a vault first, then add money to it."
        action="New vault"
        onAction={() => router.replace("/new-vault")}
      />
    );
  return (
    <Stack gap={space.md}>
      <PracticeBadge />
      <Txt v="headline" accessibilityRole="header">
        Which vault?
      </Txt>
      <View>
        {vaults.map((v, i) => (
          <View key={v.id}>
            {i > 0 ? <Divider /> : null}
            <ListRow
              leading={<VaultGlyph category={v.category} />}
              title={v.name}
              subtitle={`${moneyWhole(v.balance, v.currency)} of ${moneyWhole(v.target, v.currency)}`}
              onPress={() => onPick(v)}
              accessibilityLabel={`${v.name}, ${categoryOf(v.category).label} vault, ${moneyWhole(v.balance, v.currency)} of ${moneyWhole(v.target, v.currency)}`}
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
      <View style={{ flex: 1 }}>
        <Txt v="caption" color="textMuted">
          Into
        </Txt>
        <Txt v="labelL" numberOfLines={1}>
          {vault.name}
        </Txt>
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

function Source({ bank, loading, currency }: { bank: number | null; loading: boolean; currency: string }) {
  const { c } = useTheme();
  return (
    <Card>
      <View style={styles.source}>
        <View style={[styles.sourceIcon, { backgroundColor: c.surfaceRaised }]}>
          <BankIcon size={22} color={c.text} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="labelL">From your bank</Txt>
          {loading ? (
            <Skeleton height={16} width="50%" />
          ) : (
            <Txt v="bodyM" color="textMuted">
              {bank !== null ? `${moneyWhole(bank, currency)} available` : "Balance unavailable right now"}
            </Txt>
          )}
        </View>
      </View>
    </Card>
  );
}

function ConfirmStep({ vault, amount, error }: { vault: Vault; amount: number; error: string | null }) {
  const { c } = useTheme();
  const after = vault.balance + amount;
  const pct = Math.round(progressOf(after, vault.target) * 100);
  return (
    <>
      <PracticeBadge />
      <View style={{ alignItems: "center", gap: space.xs }}>
        <Txt v="titleM" color="textMuted" accessibilityRole="header">
          You&apos;re adding
        </Txt>
        <Amount value={amount} currency={vault.currency} size="xl" align="center" animate={false} />
      </View>
      {error ? <Banner tone="danger" title="That didn't go through" body={`${error} Nothing moved. Try again.`} /> : null}
      <Card>
        <Line label="To" value={vault.name} />
        <Divider />
        <Line label="From" value="Your bank" />
        <Divider />
        <Line label="After this" value={`${moneyWhole(after, vault.currency)} of ${moneyWhole(vault.target, vault.currency)} · ${pct}%`} />
      </Card>
      <View style={styles.lockNote}>
        <LockIcon size={18} color={c.textMuted} />
        <Txt v="bodyM" color="textMuted" style={{ flex: 1 }}>
          Once it&apos;s in, it stays locked until a matching bill or emergency access releases it.
        </Txt>
      </View>
      <ReleaseContract category={vault.category} template={vault.template} showSupportLink={false} />
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label}: ${value}`}>
      <Txt v="bodyM" color="textMuted">
        {label}
      </Txt>
      <Txt v="labelL" style={{ flex: 1, textAlign: "right" }} numberOfLines={2}>
        {value}
      </Txt>
    </View>
  );
}

function DoneStep({ deposit }: { deposit: Deposit }) {
  const { cat } = useTheme();
  const { vault, amount, before, after, crossed } = deposit;
  const meta = categoryOf(vault.category);
  const [play, setPlay] = useState(false);
  const [landed, setLanded] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  // Start just after the screen settles (and Reduce Motion has been read).
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
    <View style={{ flex: 1 }}>
      <ModalScreen title="Add money" onClose={close} footer={<Button key="done" label="Done" onPress={close} armOnMount />}>
        <PracticeBadge />
        <CoinDrop object={emoji3d[meta.key]} play={play} onImpact={onImpact} />
        <View style={{ alignItems: "center", gap: space.xs }} accessibilityLiveRegion="polite">
          <Txt v="headline" align="center" accessibilityRole="header">
            Saved
          </Txt>
          <Txt v="bodyL" color="textMuted" align="center">
            {moneyWhole(amount, vault.currency)} is in {vault.name}.
          </Txt>
        </View>
        <Card>
          <Amount value={shown} currency={vault.currency} size="l" />
          <ProgressBar value={progress} color={cat(meta.key).tint} label={`${Math.round(progress * 100)}% of the goal`} />
          <Txt v="bodyM" color="textMuted">
            {progress >= 1
              ? `Goal of ${moneyWhole(vault.target, vault.currency)} reached`
              : `${Math.round(progress * 100)}% of ${moneyWhole(vault.target, vault.currency)} · ${moneyWhole(toGo, vault.currency)} to go`}
          </Txt>
        </Card>
      </ModalScreen>
      {crossed ? (
        <Celebration
          visible={celebrating}
          kind={crossed === 4 ? "reached" : "milestone"}
          image={emoji3d[meta.key]}
          title={MILESTONE_TITLE[crossed]}
          body={`${moneyWhole(after, vault.currency)} saved in ${vault.name}`}
          onDone={endCelebration}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  destination: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: layout.rowMin },
  change: { minHeight: layout.hit, justifyContent: "center", paddingHorizontal: 4 },
  source: { flexDirection: "row", alignItems: "center", gap: space.sm },
  sourceIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  line: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48 },
  lockNote: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
});
