import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CheckCircleIcon, ShieldCheckIcon, type Icon } from "@/components/icons";
import { Amount, Banner, Button, Card, ModalScreen, PracticeBadge, Skeleton, Txt } from "@/components/ui";
import { VERIFY_ID_HREF } from "@/features/kyc/routes";
import { errorMessage } from "@/lib/api/errors";
import { useInvalidateMoney } from "@/lib/api/hooks";
import { haptic } from "@/lib/haptics";
import { layout, space, useTheme } from "@/theme";
import { moveBlock, moveUnconfirmed, WALLET_HREF } from "../model";

/** Leaves a wallet flow: back to wherever it was opened from, or the Wallet screen after a deep link. */
export function closeFlow() {
  if (router.canGoBack()) router.back();
  else router.replace(WALLET_HREF);
}

/** Back to the Wallet screen (under the flow, or in its place), where recent activity shows what happened. */
export function toWallet() {
  router.dismissTo(WALLET_HREF);
}

/**
 * What a flow does when its money move fails: the matching haptic, and when the answer never came
 * (the move may have gone through), a refresh so the wallet shows what really happened.
 */
export function useMoveFailure() {
  const invalidate = useInvalidateMoney();
  return (e: unknown) => {
    haptic(moveBlock(e) ? "warning" : "error");
    if (moveUnconfirmed(e)) void invalidate();
  };
}

/** A label and its value on one line of a confirm card. Wraps instead of clipping at large text. */
export function FlowLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label}: ${value}`}>
      <Txt v="bodyM" color="textMuted">
        {label}
      </Txt>
      <Txt v="labelL" style={styles.lineValue}>
        {value}
      </Txt>
    </View>
  );
}

/** Where the money comes from or goes to, with what's there now. */
export function PlaceCard({ icon: IconCmp, title, line, loading }: { icon: Icon; title: string; line: string | null; loading?: boolean }) {
  const { c } = useTheme();
  return (
    <Card>
      <View style={styles.place} accessible accessibilityLabel={line ? `${title}. ${line}` : title}>
        <View style={[styles.placeIcon, { backgroundColor: c.surfaceRaised }]}>
          <IconCmp size={22} color={c.text} />
        </View>
        <View style={styles.placeText}>
          <Txt v="labelL">{title}</Txt>
          {loading ? (
            <Skeleton height={16} width="50%" />
          ) : line ? (
            <Txt v="bodyM" color="textMuted">
              {line}
            </Txt>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

/**
 * A money move that didn't go through. An account hold is said calmly with the server's own words
 * and the way forward (the ID check, or Settings while a recovery is checked). When the answer
 * never came, the move may still have happened, so it never says nothing moved: it sends people
 * to the wallet's recent activity instead of offering the same move again.
 */
export function MoveFailed({ error }: { error: unknown }) {
  const block = moveBlock(error);
  if (block)
    return (
      <Banner
        tone="info"
        icon={ShieldCheckIcon}
        title={block.title}
        body={block.body}
        action={
          block.code === "kyc_required"
            ? { label: "Verify your ID", onPress: () => router.replace(VERIFY_ID_HREF) }
            : { label: "Go to Settings", onPress: () => router.replace("/settings") }
        }
      />
    );
  if (moveUnconfirmed(error))
    return (
      <Banner
        tone="warning"
        title="We couldn't confirm this"
        body="We couldn't confirm this went through. Check your wallet's recent activity before you try again."
      />
    );
  return <Banner tone="danger" title="That didn't go through" body={`${errorMessage(error)} Nothing moved.`} />;
}

/** The main button after a move whose answer never came: to the wallet, never the same move again. */
export function CheckWalletButton() {
  return <Button key="check-wallet" label="Check your wallet" onPress={toWallet} armOnMount />;
}

/** The end of a money move (calm core: a tick and plain words, no celebration). */
export function DoneScreen({
  title,
  heading,
  body,
  balance,
  currency,
  extra,
}: {
  title: string;
  heading: string;
  body: string;
  /** The wallet's balance after the move, when known. */
  balance: number | null;
  currency: string;
  extra?: ReactNode;
}) {
  const { c } = useTheme();
  return (
    <ModalScreen title={title} onClose={closeFlow} footer={<Button key="done" label="Done" onPress={closeFlow} armOnMount />}>
      <View style={styles.done} accessibilityLiveRegion="polite">
        <CheckCircleIcon size={56} color={c.success} weight="fill" />
        <Txt v="headline" align="center" accessibilityRole="header">
          {heading}
        </Txt>
        <Txt v="bodyL" align="center">
          {body}
        </Txt>
        <PracticeBadge />
      </View>
      {balance !== null ? (
        <Card>
          <Txt v="labelM" color="textMuted">
            In your wallet now
          </Txt>
          <Amount value={balance} currency={currency} size="m" />
        </Card>
      ) : null}
      {extra}
    </ModalScreen>
  );
}

/** Loading a flow's wallet: the shape of an amount step. */
export function FlowSkeleton() {
  return (
    <View style={{ gap: space.md }} accessible accessibilityRole="progressbar" accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      <Skeleton height={24} width="40%" />
      <Skeleton height={64} width="60%" />
      <Skeleton height={72} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: space.md, rowGap: 2, minHeight: 48, paddingVertical: 4 },
  lineValue: { flexGrow: 1, flexShrink: 1, textAlign: "right" },
  place: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: layout.hit },
  placeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  placeText: { flex: 1, gap: 2 },
  done: { alignItems: "center", gap: space.sm, paddingTop: space.xl },
});
