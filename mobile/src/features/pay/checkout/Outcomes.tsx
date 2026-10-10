import { StyleSheet, View } from "react-native";
import { CheckCircleIcon, HourglassIcon, LockIcon, ReceiptIcon, XCircleIcon } from "@/components/icons";
import { Banner, Button, Card, ModalScreen, MoneyText, PracticeBadge, Row, Stack, StatusPill, Timeline, Txt } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import type { PaymentIntent } from "@/lib/api/pay-types";
import { space, useTheme } from "@/theme";
import { payAmount } from "../format";
import { Paper, PaperLine, PaperRow } from "./paper";
import { checkoutSteps } from "./stages";
import type { CheckoutFlow } from "./useCheckoutFlow";
import { payingVault, remainingAfter } from "./vaults";

/**
 * Checkout outcomes. Calm core: payment success is plain (no celebration, no confetti — never
 * celebrate money going out); every negative outcome has a reason, a next step and a person.
 */

/** Succeeded: outcome first, then a receipt with the vault and what's left in it. */
export function Paid({ intent, flow }: { intent: PaymentIntent; flow: CheckoutFlow }) {
  const { c } = useTheme();
  const vault = flow.paidFrom ?? payingVault(intent, flow.vault);
  const left = remainingAfter(intent, flow.paidFrom);
  if (intent.dryRun) return <DryRunPassed intent={intent} flow={flow} vaultName={vault?.name ?? null} />;
  return (
    <ModalScreen title="Receipt" onClose={flow.done} footer={<Button label="Done" armOnMount onPress={flow.done} />}>
      <Stack gap={space.xs}>
        <CheckCircleIcon size={40} color={c.success} weight="fill" />
        <Txt v="displayM" accessibilityRole="header">
          Paid.
        </Txt>
        <Txt v="bodyL">
          {payAmount(intent.amount, intent.currency)} paid to {intent.merchant.name}.
        </Txt>
        <PracticeBadge />
      </Stack>
      <Paper>
        <PaperRow label="Merchant" value={intent.merchant.name} />
        <PaperRow label="Amount" value={<MoneyText value={intent.amount} currency={intent.currency} color={c.ink} />} />
        {vault ? <PaperRow label="Paid from" value={vault.name} /> : null}
        {vault && left !== null ? (
          <PaperRow label={`Left in ${vault.name}`} value={<MoneyText value={left} currency={intent.currency} color={c.ink} />} />
        ) : null}
        <PaperRow label="Reference" value={<Txt v="numS" color="ink">{intent.reference}</Txt>} />
        <PaperLine />
        <Row gap={space.xs}>
          <ReceiptIcon size={20} color={c.ink} />
          <Txt v="bodyM" color="ink" style={styles.flex}>
            {vault ? `Receipt saved to ${vault.name}` : "Receipt saved to your vault"}
          </Txt>
        </Row>
      </Paper>
      <Txt v="bodyM" color="textMuted">
        If {intent.merchant.name} refunds you, the money goes straight back to {vault ? vault.name : "the same vault"}.
      </Txt>
    </ModalScreen>
  );
}

/**
 * A dry run in a live session (merchant checkout isn't live yet): the checks passed, but nothing
 * was paid, so no balance, receipt or refund is claimed.
 */
function DryRunPassed({ intent, flow, vaultName }: { intent: PaymentIntent; flow: CheckoutFlow; vaultName: string | null }) {
  const { c } = useTheme();
  return (
    <ModalScreen title="Checkout" onClose={flow.done} footer={<Button label="Done" armOnMount onPress={flow.done} />}>
      <Stack gap={space.xs}>
        <CheckCircleIcon size={40} color={c.success} weight="fill" />
        <Txt v="displayM" accessibilityRole="header">
          Practice run done.
        </Txt>
        <Txt v="bodyL">
          {payAmount(intent.amount, intent.currency)} to {intent.merchant.name} passed every check.
        </Txt>
        <PracticeBadge />
      </Stack>
      <Banner tone="info" title="Nothing was paid" body={dryRunNote(vaultName)} />
      <Paper>
        <PaperRow label="Merchant" value={intent.merchant.name} />
        <PaperRow label="Amount" value={<MoneyText value={intent.amount} currency={intent.currency} color={c.ink} />} />
        {vaultName ? <PaperRow label="Would pay from" value={vaultName} /> : null}
        <PaperRow label="Reference" value={<Txt v="numS" color="ink">{intent.reference}</Txt>} />
      </Paper>
    </ModalScreen>
  );
}

/** What a dry run changed: nothing. */
function dryRunNote(vaultName: string | null) {
  return `Merchant checkout isn't live yet, so this was a practice run. ${vaultName ?? "Your vault"} still has the same balance.`;
}

/** Sent to a person: why, that the money is set aside, and a person to talk to. */
export function InReview({ intent, flow }: { intent: PaymentIntent; flow: CheckoutFlow }) {
  const vault = payingVault(intent, flow.vault);
  const amount = payAmount(intent.amount, intent.currency);
  if (intent.dryRun)
    return (
      <ModalScreen
        title="Checkout"
        onClose={flow.done}
        footer={
          <>
            <Button label="Talk to a person" variant="tonal" size="md" onPress={flow.talkToPerson} />
            <Button label="Done" armOnMount onPress={flow.done} />
          </>
        }
      >
        <Stack gap={space.xs}>
          <StatusPill tone="warning" label="Needs a person" icon={HourglassIcon} />
          <Txt v="headline" accessibilityRole="header">
            A person would take a look.
          </Txt>
          <Txt v="bodyL">{intent.decisionReason ?? "Something on the invoice would need a second look before it's paid."}</Txt>
        </Stack>
        <Banner tone="info" title="Nothing is set aside" body={dryRunNote(vault?.name ?? null)} />
        <PracticeBadge />
        <Tracker intent={intent} vaultName={vault?.name ?? null} />
      </ModalScreen>
    );
  return (
    <ModalScreen
      title="Checkout"
      onClose={flow.done}
      footer={
        <>
          <Button label="Talk to a person" variant="tonal" size="md" onPress={flow.talkToPerson} />
          <Button label="Done" armOnMount onPress={flow.done} />
        </>
      }
    >
      <Stack gap={space.xs}>
        <StatusPill tone="warning" label="Being checked" icon={HourglassIcon} />
        <Txt v="headline" accessibilityRole="header">
          A person&apos;s taking a look.
        </Txt>
        <Txt v="bodyL">{intent.decisionReason ?? "Something on the invoice needs a second look before it's paid."}</Txt>
      </Stack>
      <Banner
        tone="info"
        icon={LockIcon}
        title={`Your ${amount} is set aside meanwhile`}
        body={`It's held in ${vault?.name ?? "your vault"} and nothing is paid until the check is done.`}
      />
      <PracticeBadge />
      <Tracker intent={intent} vaultName={vault?.name ?? null} />
    </ModalScreen>
  );
}

/** Declined by the checks: the plain reason, where the money is, and a person. */
export function Declined({ intent, flow }: { intent: PaymentIntent; flow: CheckoutFlow }) {
  const vault = payingVault(intent, flow.vault);
  return (
    <ModalScreen
      title="Checkout"
      onClose={flow.done}
      footer={
        <>
          <Button label="Talk to a person" variant="tonal" size="md" onPress={flow.talkToPerson} />
          <Button label="Done" armOnMount onPress={flow.done} />
        </>
      }
    >
      <Stack gap={space.xs}>
        <StatusPill tone="danger" label="Not paid" icon={XCircleIcon} />
        <Txt v="headline" accessibilityRole="header">
          This payment didn&apos;t go through
        </Txt>
        <Txt v="bodyL">{intent.decisionReason ?? "The invoice didn't pass the checks for this vault."}</Txt>
        <Txt v="bodyM" color="textMuted">
          Your money is still in {vault?.name ?? "your vault"}. A person can go through it with you.
        </Txt>
        <PracticeBadge />
      </Stack>
      <Tracker intent={intent} vaultName={vault?.name ?? null} />
    </ModalScreen>
  );
}

/** Confirming failed (network, server, not enough available). Nothing moved; try again or ask. */
export function PaymentFailed({ error, flow }: { error: unknown; flow: CheckoutFlow }) {
  return (
    <ModalScreen
      title="Checkout"
      onClose={flow.close}
      footer={
        <>
          <Button label="Talk to a person" variant="tonal" size="md" onPress={flow.talkToPerson} />
          <Button label="Try again" armOnMount onPress={flow.backToReview} />
        </>
      }
    >
      <Stack gap={space.xs}>
        <StatusPill tone="danger" label="Not paid" icon={XCircleIcon} />
        <Txt v="headline" accessibilityRole="header">
          Payment didn&apos;t go through
        </Txt>
        <Txt v="bodyL">{errorMessage(error)}</Txt>
        <Txt v="bodyM" color="textMuted">
          No money moved. You can try again, or ask a person to check.
        </Txt>
        <PracticeBadge />
      </Stack>
    </ModalScreen>
  );
}

function Tracker({ intent, vaultName }: { intent: PaymentIntent; vaultName: string | null }) {
  const steps = checkoutSteps(intent, vaultName);
  if (!steps.length) return null;
  return (
    <Card>
      <View style={styles.trackerHead}>
        <Txt v="labelM" color="textMuted">
          Where it is
        </Txt>
      </View>
      <Timeline steps={steps} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  trackerHead: { marginBottom: space.xxs },
});
