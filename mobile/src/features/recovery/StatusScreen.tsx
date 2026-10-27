import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Banner, Button, Card, Divider, ScreenSkeleton, StatusPill, Timeline, Txt, type TimelineStep, type Tone } from "@/components/ui";
import { CalmError } from "@/features/account/controls";
import { Page } from "@/features/account/layout";
import { dateText, whenText } from "@/features/proof/format";
import { Dialog } from "@/features/vaults/Dialog";
import { idLine } from "@/features/kyc/status";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { spokenId } from "@/lib/api/identity-ids";
import type { RecoveryClaim } from "@/lib/api/identity-types";
import { useMe } from "@/lib/api/hooks";
import { invalidate } from "@/lib/api/keys";
import { usePracticeMode } from "@/lib/api/practice";
import { haptic } from "@/lib/haptics";
import { space } from "@/theme";
import { useRecoveryClaim } from "./queries";

const COPY: Record<RecoveryClaim["status"], { tone: Tone; pill: string; title: string; body: string }> = {
  pending: {
    tone: "info",
    pill: "Being checked",
    title: "A person is checking it's you",
    body: "You can look around. Money can't move until they confirm it's you, usually within a day.",
  },
  approved: { tone: "success", pill: "Approved", title: "Your account is yours again", body: "Money can move. The old login no longer works." },
  rejected: { tone: "danger", pill: "Not approved", title: "This request wasn't approved", body: "A person couldn't confirm the account is yours." },
  cancelled: { tone: "neutral", pill: "Cancelled", title: "You cancelled this request", body: "Nothing changed on the account." },
  expired: { tone: "neutral", pill: "Ran out", title: "This request ran out", body: "Nobody could check it within 7 days. You can send a new one." },
};

/** Waiting with no access ("after_approval"): the account opens only once a person approves. */
const WAITING_NO_ACCESS = {
  title: "A person is checking your ID",
  body: "You can sign in to your account once they confirm it's you, usually within a day.",
};

function steps(c: RecoveryClaim, access: boolean): TimelineStep[] {
  const decided = c.status !== "pending";
  return [
    { key: "sent", title: "You sent your ID", time: whenText(c.createdAt), state: "done" },
    access || decided
      ? { key: "checks", title: "Automatic checks", detail: "The ID matches the one on the account.", state: "done" }
      : { key: "checks", title: "Automatic checks", detail: "Some need a person to look, so access waits for them.", state: "warn" },
    {
      key: "person",
      title: "A person confirms it's you",
      detail: decided ? undefined : "Usually within a day.",
      time: c.decidedAt ? whenText(c.decidedAt) : undefined,
      state: c.status === "approved" ? "done" : c.status === "pending" ? "active" : c.status === "rejected" ? "failed" : "skipped",
    },
    { key: "open", title: access || decided ? "Money can move again" : "You can open the account", state: c.status === "approved" ? "done" : "pending" },
  ];
}

/** Account recovery: where the request is, and a way to cancel it while it waits. */
export function RecoveryStatusScreen() {
  const practice = usePracticeMode();
  const qc = useQueryClient();
  const me = useMe();
  const q = useRecoveryClaim({ watch: true });
  // Read-only access meanwhile (the ID passed the automatic checks), or none until a person
  // approves. Older servers don't say: then /me does.
  const access = q.data?.access ? q.data.access === "read_only" : practice || !!me.data?.onboarded;
  const status = q.data?.status;
  // Once it's decided (approved, rejected, ran out), /me changes: read it again so the app follows.
  useEffect(() => {
    if (status && status !== "pending") void invalidate(qc, "me");
  }, [status, qc]);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const cancel = async () => {
    setCancelling(true);
    setFailure(null);
    try {
      await api.cancelClaim();
      setConfirming(false);
      // Live, the login is no longer tied to the account and the app goes back to set-up.
      await invalidate(qc, "recovery", "me");
    } catch (e) {
      haptic("error");
      setConfirming(false);
      setFailure(e);
    } finally {
      setCancelling(false);
    }
  };

  const c = q.data;
  return (
    <Page title="Account recovery" onRefresh={() => q.refetch()}>
      {q.isPending ? (
        <ScreenSkeleton />
      ) : q.isError ? (
        <CalmError error={q.error} onRetry={() => void q.refetch()} title="Your request didn't load" />
      ) : !c ? (
        <View style={{ gap: space.xs }}>
          <Txt v="titleL" accessibilityRole="header">
            No recovery request
          </Txt>
          <Txt v="bodyM" color="textMuted">
            {"There's nothing waiting for a person on this login."}
          </Txt>
        </View>
      ) : (
        <>
          <View style={{ gap: space.xs }}>
            <StatusPill tone={COPY[c.status].tone} label={COPY[c.status].pill} />
            <Txt v="headline" accessibilityRole="header">
              {c.status === "pending" && !access ? WAITING_NO_ACCESS.title : COPY[c.status].title}
            </Txt>
            <Txt v="bodyL" color="textMuted">
              {c.status === "rejected" && c.reasons[0] ? c.reasons[0] : c.status === "pending" && !access ? WAITING_NO_ACCESS.body : COPY[c.status].body}
            </Txt>
          </View>
          <Timeline steps={steps(c, access)} />
          <Card>
            <View style={styles.line} accessible accessibilityLabel={`ID: ${spokenId(c.docType, c.idLast4)}`}>
              <Txt v="bodyM" color="textMuted">
                ID
              </Txt>
              <Txt v="numM">{idLine(c.docType, c.idLast4)}</Txt>
            </View>
            {c.status === "pending" && c.expiresAt ? (
              <>
                <Divider />
                <View style={styles.line}>
                  <Txt v="bodyM" color="textMuted">
                    Open until
                  </Txt>
                  <Txt v="bodyM">{dateText(c.expiresAt)}</Txt>
                </View>
              </>
            ) : null}
          </Card>
          {c.notifiedEmail ? (
            <Txt v="bodyM" color="textMuted">{`We told the account's email, ${c.notifiedEmail}, about this request.`}</Txt>
          ) : null}
          {practice && c.status === "pending" ? (
            <Banner
              tone="info"
              title="Practice"
              body={`A pretend person approves this about 20 seconds after you sent it. This screen updates by itself.${
                access ? "" : " A real new login would have no access until then; Practice keeps you in the sample account."
              }`}
            />
          ) : null}
          {failure ? <Banner tone="danger" title="It wasn't cancelled" body={errorMessage(failure)} /> : null}
          {c.status === "pending" ? (
            <Button label="Cancel this request" variant="dangerOutline" size="md" onPress={() => setConfirming(true)} />
          ) : (
            <Button label="Done" variant="tonal" size="md" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
          )}
        </>
      )}
      <Dialog
        visible={confirming}
        title="Cancel this request?"
        body="A person won't check it, and this login won't open the account. You can send a new request later."
        onDismiss={() => setConfirming(false)}
        actions={[
          { label: "Cancel the request", variant: "danger", loading: cancelling, onPress: () => void cancel() },
          { label: "Keep it", variant: "tonal", onPress: () => setConfirming(false) },
        ]}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm, minHeight: 32 },
});
