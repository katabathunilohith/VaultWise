import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { router, Stack as RouterStack } from "expo-router";
import { Banner, Button, HoldToConfirm, Txt, useHardwareBack } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/api/hooks"; // identity
import { PRACTICE_PIN, usePracticeMode } from "@/lib/api/practice";
import { haptic } from "@/lib/haptics";
import { authenticateBiometric } from "@/lib/auth/biometrics";
import { useSession } from "@/lib/auth/session-state";
import { space, useTheme } from "@/theme";
import { goBack, Page, StepScreen } from "../../layout";
import { biometricName, GuardedPinPad, PinLayout, PinStatus, pinVerifier, useBiometricKind, usePinGuard } from "../../pin";
import { finishDeletion } from "./finishDeletion";
import { DeleteReview } from "./DeleteReview";

type Phase = "review" | "confirm" | "verify" | "deleting" | "failed";

/**
 * Delete account (R5): consequences and where each balance goes, an acknowledgement, then a
 * confirmation where keeping the account is the main button, then the PIN.
 */
export function DeleteAccountScreen() {
  const qc = useQueryClient();
  const practice = usePracticeMode();
  // identity: with sign-in on, the server closes the account (records kept) rather than deleting it.
  const me = useMe();
  const closing = !practice && me.data?.auth?.mode === "firebase";
  const [phase, setPhase] = useState<Phase>("review");
  const [ack, setAck] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Android Back steps back through the flow; nothing while the deletion runs.
  useHardwareBack(
    phase === "deleting" ? "block" : phase === "confirm" ? () => setPhase("review") : phase === "verify" ? () => setPhase("confirm") : null,
  );
  // The iOS swipe-back would leave the flow mid-step; Back in the header steps back instead.
  const options = <RouterStack.Screen options={{ gestureEnabled: phase === "review" || phase === "failed" }} />;

  const commit = async () => {
    setPhase("deleting");
    try {
      await finishDeletion(qc);
    } catch (e) {
      haptic("error");
      setFailure(e);
      setPhase("failed");
      return;
    }
    // Live: the root gate has already moved to Welcome and this screen is gone. Still here means
    // the gate hasn't seen the change yet (demo keeps its sample account, or /me didn't answer);
    // Welcome is closed to an onboarded account, so go Home and let the gate catch up. dismissTo
    // goes back to the tabs already under Settings (replace would stack a second copy of them).
    requestAnimationFrame(() => {
      if (mounted.current) router.dismissTo("/");
    });
  };

  if (phase === "confirm")
    return (
      <>
        {options}
        <Page
          title="Delete account"
          onBack={() => setPhase("review")}
          footer={
            <>
              <Button label="Delete my account" variant="dangerOutline" size="md" onPress={() => setPhase("verify")} />
              <Button label="Keep my account" armOnMount onPress={goBack} />
            </>
          }
        >
          <View style={styles.confirm}>
            <Txt v="headline" accessibilityRole="header">
              {closing ? "Close your account for good?" : "Delete your account for good?"}
            </Txt>
            <Txt v="bodyL">
              {practice
                ? "The demo data and this phone's settings are reset. This can't be undone."
                : closing // identity
                  ? "Closes your account and signs this login out. Records are kept as the law requires. This can't be undone."
                  : "Your vaults close, your history is deleted and the balances go back to your bank. This can't be undone."}
            </Txt>
          </View>
        </Page>
      </>
    );

  if (phase === "verify")
    return (
      <>
        {options}
        <Verify onBack={() => setPhase("confirm")} onConfirmed={() => void commit()} />
      </>
    );

  if (phase === "deleting")
    return (
      <>
        {options}
        <StepScreen scroll={false}>
          <Working closing={closing} />
        </StepScreen>
      </>
    );

  if (phase === "failed")
    return (
      <>
        {options}
        <Page
          title="Delete account"
          footer={
            <>
              <Button label="Talk to a person" variant="tonal" size="md" onPress={() => router.push("/support")} />
              <Button label="Try again" armOnMount onPress={() => void commit()} />
            </>
          }
        >
          <Banner tone="danger" title={closing ? "Your account wasn't closed" : "Your account wasn't deleted"} body={`${errorMessage(failure)} Nothing has changed.`} />
          <Txt v="bodyM" color="textMuted">
            Try again, or ask a person to do it for you. You can also do this from the web app.
          </Txt>
        </Page>
      </>
    );

  return (
    <>
      {options}
      <Page
        title="Delete account"
        footer={
          <Button
            label="Delete account…"
            variant="dangerOutline"
            disabled={!ack}
            onPress={() => setPhase("confirm")}
            accessibilityHint={ack ? undefined : "Tick the box above first"}
          />
        }
      >
        <DeleteReview ack={ack} onAck={setAck} demo={practice} closing={closing} />
      </Page>
    </>
  );
}

/** Last step: the PIN (or Face ID). Without any PIN on this phone, a press-and-hold instead. */
function Verify({ onBack, onConfirmed }: { onBack: () => void; onConfirmed: () => void }) {
  const session = useSession();
  const kind = useBiometricKind();
  const guard = usePinGuard();
  const verify = pinVerifier(session.hasDevicePin);
  const confirmed = () => {
    haptic("irreversible.commit");
    onConfirmed();
  };
  const tryBiometric = async () => {
    if (kind && (await authenticateBiometric("Delete your Vaultwise account"))) confirmed();
  };

  if (!verify)
    return (
      <StepScreen back={onBack} footer={<HoldToConfirm label="Hold to delete account" onConfirm={onConfirmed} />}>
        <Txt v="headline" accessibilityRole="header">
          Confirm it&apos;s you
        </Txt>
        <Txt v="bodyL">There&apos;s no PIN on this phone yet, so press and hold the button to delete your account.</Txt>
      </StepScreen>
    );

  const bio = biometricName(kind);
  const demoHint = !session.hasDevicePin ? ` In demo mode the PIN is ${PRACTICE_PIN}.` : "";
  return (
    <StepScreen back={onBack} scroll={false}>
      <PinLayout
        bottomInset={false}
        title="Enter your PIN to delete"
        body={`${bio ? `Or use ${bio}. ` : ""}This deletes your account.${demoHint}`}
        status={<PinStatus guard={guard} />}
        pad={<GuardedPinPad guard={guard} verify={verify} onSuccess={confirmed} biometric={kind ?? null} onBiometric={() => void tryBiometric()} />}
      />
    </StepScreen>
  );
}

/** While the deletion runs there's no way back: it finishes or reports what went wrong. */
function Working({ closing }: { closing: boolean }) {
  const { c } = useTheme();
  return (
    <View style={styles.working} accessibilityLiveRegion="polite">
      <ActivityIndicator color={c.text} size="large" />
      <Txt v="titleL" align="center" accessibilityRole="header">
        {closing ? "Closing your account" : "Deleting your account"}
      </Txt>
      <Txt v="bodyM" color="textMuted" align="center">
        This takes a few seconds.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  confirm: { gap: space.sm, paddingTop: space.lg },
  working: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.sm, paddingBottom: space.xxxl },
});
