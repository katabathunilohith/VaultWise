import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CheckCircleIcon } from "@/components/icons";
import { AmountKeypad, Banner, Button, Card, ModalScreen, PracticeBadge, Txt, useHardwareBack, useNow } from "@/components/ui";
import { shortDate } from "@/features/home/format";
import { TypedAmount } from "@/features/vaults/fields";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { WALLET_MAX_AMOUNT, type Wallet } from "@/lib/api/wallet-types";
import { haptic } from "@/lib/haptics";
import { parseAmount } from "@/lib/money";
import { space, useTheme } from "@/theme";
import { useRefreshWallet } from "../hooks";
import { HandPalmIcon } from "../icons";
import { amountText, moveUnconfirmed } from "../model";
import { closeFlow } from "./parts";

type Step = "amount" | "check" | "done";
/** What a new limit does to the current one. Raising and turning off are the once-a-month kind. */
type Change = "on" | "lower" | "raise" | "off" | "same";

function changeOf(current: number | null, next: number | null): Change {
  if (current === null) return next === null ? "same" : "on";
  if (next === null) return "off";
  return next > current ? "raise" : next < current ? "lower" : "same";
}

const loosens = (c: Change) => c === "raise" || c === "off";

/**
 * The wallet's daily spending limit: turn it on, lower it, raise it or turn it off. Lowering or
 * turning on works any time. Raising or turning off works once every 30 days, after the same scam
 * check as the other limits.
 */
export function LimitFlow({ wallet }: { wallet: Wallet }) {
  const refresh = useRefreshWallet();
  const [step, setStep] = useState<Step>("amount");
  const [value, setValue] = useState("");
  const [target, setTarget] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<{ change: Change; limit: number | null; nextRaiseAt: number | null } | null>(null);

  const now = useNow(60_000);
  const cur = wallet.currency;
  const current = wallet.dailyLimit;
  const locked = !wallet.limitRaiseAvailable;
  const nextRaise = wallet.nextRaiseAt ? shortDate(wallet.nextRaiseAt, now) : null;
  const amount = parseAmount(value);
  const change = amount === null ? null : changeOf(current, amount);
  const tooBig = amount !== null && amount > WALLET_MAX_AMOUNT * 100;
  const blocked = change === "raise" && locked;
  const valid = amount !== null && !tooBig && change !== "same" && !blocked;

  useHardwareBack(saving ? "block" : step === "check" ? () => setStep("amount") : null);

  const type = (next: string) => {
    const n = parseAmount(next);
    // The once-a-month rule engaged: say so once, as it's crossed.
    if (locked && current !== null && n !== null && n > current && !blocked) haptic("warning");
    setValue(next);
  };

  const save = async (next: number | null) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.walletSettings({ dailyLimit: next === null ? null : next / 100 });
      const made = changeOf(current, next);
      setSaved({ change: made, limit: next, nextRaiseAt: res?.wallet?.nextRaiseAt ?? (loosens(made) ? Date.now() + 30 * 86_400_000 : null) });
      setStep("done");
      void refresh();
    } catch (e) {
      haptic("error");
      setError(e);
      // It may have saved without the answer arriving: re-read the wallet so the screen shows the limit it has now.
      if (moveUnconfirmed(e)) void refresh();
      setStep("amount");
    } finally {
      setSaving(false);
    }
  };

  /** A raise or turning off goes through the scam check first; anything stricter applies at once. */
  const go = (next: number | null) => {
    setTarget(next);
    setError(null);
    if (loosens(changeOf(current, next))) setStep("check");
    else void save(next);
  };

  if (step === "done" && saved) return <Saved saved={saved} currency={cur} now={now} />;

  if (step === "check")
    return (
      <ModalScreen
        title="Daily limit"
        back={() => {
          if (!saving) setStep("amount");
        }}
        footer={
          <>
            <Button label="I'm doing this myself" variant="tonal" size="md" loading={saving} onPress={() => void save(target)} />
            <Button label="Talk to us" armOnMount disabled={saving} onPress={() => router.replace("/support")} />
          </>
        }
      >
        <ScamCheck what={target === null ? "turn off your limit" : "raise your limit"} />
      </ModalScreen>
    );

  let hint: string;
  if (amount === null) hint = current === null ? "Enter how much can leave your wallet each day." : "Enter the new daily limit.";
  else if (tooBig) hint = "That's more than the most allowed.";
  else if (change === "same") hint = "That's your limit now.";
  else if (blocked) hint = `You can raise it again on ${nextRaise ?? "a later date"}. You can lower it now.`;
  else if (change === "raise") hint = "You can raise it once every 30 days.";
  else hint = "It applies straight away.";

  const label =
    !valid || amount === null
      ? current === null
        ? "Set limit"
        : "Change limit"
      : change === "on"
        ? `Set ${amountText(amount, cur)} a day`
        : change === "lower"
          ? `Lower to ${amountText(amount, cur)}`
          : `Raise to ${amountText(amount, cur)}`;

  return (
    <ModalScreen
      title="Daily limit"
      onClose={closeFlow}
      footer={
        <>
          <AmountKeypad value={value} onChange={type} maxDecimals={0} />
          <Button key="amount" label={label} disabled={!valid} loading={saving} armOnMount onPress={() => amount !== null && go(amount)} />
        </>
      }
    >
      <PracticeBadge compact />
      <View style={styles.head}>
        <Txt v="titleL" accessibilityRole="header">
          {current === null ? "Set a daily limit" : "Change your daily limit"}
        </Txt>
        <Txt v="bodyM" color="textMuted">
          {current === null ? "Your wallet has no daily limit now." : `Now ${amountText(current, cur)} a day. ${amountText(wallet.spentToday, cur)} used today.`}
        </Txt>
      </View>
      <View style={styles.amount} accessibilityLiveRegion="polite">
        <TypedAmount value={value} currency={cur} caption="New daily limit" />
        <Txt v="bodyM" color={blocked || tooBig ? "text" : "textMuted"} align="center">
          {hint}
        </Txt>
      </View>
      {error ? (
        moveUnconfirmed(error) ? (
          <Banner tone="warning" title="We couldn't confirm the change" body="Check your limit on the Wallet screen before you try again." />
        ) : (
          <Banner tone="danger" title="That didn't save" body={`${errorMessage(error)} Nothing changed.`} />
        )
      ) : null}
      <Rules locked={locked} nextRaise={nextRaise} />
      {current !== null ? (
        <View style={styles.off}>
          <Button
            label="Turn off the limit"
            variant="tonal"
            size="md"
            disabled={locked || saving}
            onPress={() => go(null)}
            accessibilityHint={locked ? `You can turn it off again on ${nextRaise ?? "a later date"}.` : "Asks you to check first, then turns the limit off"}
          />
          {locked ? (
            <Txt v="caption" color="textMuted">
              {`Turning it off counts as a raise. You can do it again on ${nextRaise ?? "a later date"}.`}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </ModalScreen>
  );
}

/** The rule, in plain words. */
function Rules({ locked, nextRaise }: { locked: boolean; nextRaise: string | null }) {
  return (
    <Card>
      <Txt v="labelL" accessibilityRole="header">
        How the daily limit works
      </Txt>
      <Txt v="bodyM">It caps what can leave your wallet in a day: payments and cash outs. Moving money into a vault doesn&apos;t count.</Txt>
      <Txt v="bodyM">You can turn it on or lower it any time. That applies straight away.</Txt>
      <Txt v="bodyM">
        {locked && nextRaise
          ? `You can raise it or turn it off once every 30 days. Your next chance is ${nextRaise}.`
          : "You can raise it or turn it off once every 30 days."}
      </Txt>
      <Txt v="bodyM" color="textMuted">
        It starts again at midnight each day.
      </Txt>
    </Card>
  );
}

/** The scam interstitial before any raise, as on Your limits. Calm, plain, with a person one tap away. */
function ScamCheck({ what }: { what: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.check}>
      <View style={[styles.icon, { backgroundColor: c.surfaceRaised }]}>
        <HandPalmIcon size={36} color={c.text} />
      </View>
      <Txt v="headline" accessibilityRole="header">
        Is someone telling you to do this?
      </Txt>
      <Txt v="bodyL">{`Real banks, police and tax offices never ask you to ${what} and move money. If anyone is rushing you, stop here and tap Talk to us.`}</Txt>
      <Txt v="bodyM" color="textMuted">
        A person will help you check, and nothing changes while you talk.
      </Txt>
    </View>
  );
}

function Saved({ saved, currency, now }: { saved: { change: Change; limit: number | null; nextRaiseAt: number | null }; currency: string; now: number }) {
  const { c } = useTheme();
  const { change, limit, nextRaiseAt } = saved;
  const heading = change === "on" ? "Limit set" : change === "lower" ? "Limit lowered" : change === "raise" ? "Limit raised" : "Limit turned off";
  const body =
    limit === null ? "Your wallet has no daily cap now. You can turn one back on any time." : `Up to ${amountText(limit, currency)} can leave your wallet each day. It applies now.`;
  const next = loosens(change) && nextRaiseAt ? `Your next raise is from ${shortDate(nextRaiseAt, now)}. You can lower it any time.` : "You can lower it again any time.";
  return (
    <ModalScreen title="Daily limit" onClose={closeFlow} footer={<Button key="done" label="Done" onPress={closeFlow} armOnMount />}>
      <View style={styles.done} accessibilityLiveRegion="polite">
        <CheckCircleIcon size={56} color={c.success} weight="fill" />
        <Txt v="headline" align="center" accessibilityRole="header">
          {heading}
        </Txt>
        <Txt v="bodyL" align="center">
          {body}
        </Txt>
        <Txt v="bodyM" color="textMuted" align="center">
          {next}
        </Txt>
        <PracticeBadge />
      </View>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.xs },
  amount: { gap: space.xs, alignItems: "center" },
  off: { gap: space.xs },
  check: { gap: space.lg, paddingTop: space.lg },
  icon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  done: { alignItems: "center", gap: space.sm, paddingTop: space.xl },
});
