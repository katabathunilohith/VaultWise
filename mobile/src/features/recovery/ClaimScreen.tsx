import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Banner, Button, ModalScreen, Txt, useHardwareBack } from "@/components/ui";
import { checkIdForm, EMPTY_ID_FORM, IdForm, idSubmission, type IdFormErrors, type IdFormValue } from "@/features/kyc/IdForm";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import type { ClaimInput, RecoveryClaim } from "@/lib/api/identity-types";
import { invalidate } from "@/lib/api/keys";
import { usePracticeMode } from "@/lib/api/practice";
import { haptic } from "@/lib/haptics";
import { space, useTheme } from "@/theme";
import { setStatusAfterClaim } from "./intent";
import { useIdMarket } from "./market";
import { RECOVERY_HREF } from "./routes";
import { ensureAiAnswer } from "@/features/ai-consent"; // ai-consent

const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

type Phase = "form" | "sending" | "sent" | "noMatch";

/**
 * A new login asks for an old account back by showing the ID that account verified. On a match,
 * its own email is told and a person decides. If the automatic checks pass, the account opens
 * read-only meanwhile; otherwise the login waits with no access until the person approves.
 */
export function ClaimScreen() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const practice = usePracticeMode();
  const market = useIdMarket();
  const [phase, setPhase] = useState<Phase>("form");
  const [form, setForm] = useState<IdFormValue>(EMPTY_ID_FORM);
  const [errors, setErrors] = useState<IdFormErrors>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [claim, setClaim] = useState<RecoveryClaim | null>(null);
  useHardwareBack(phase === "sending" || phase === "sent" ? "block" : phase === "noMatch" ? () => setPhase("form") : null);

  const submit = async () => {
    const e = checkIdForm(form, { photo: "required", market: null });
    setErrors(e);
    if (Object.keys(e).length) {
      haptic("error");
      return;
    }
    // ai-consent: ask once whether an AI may read the ID; closing the question sends nothing.
    if (!(await ensureAiAnswer())) return;
    setFailure(null);
    setPhase("sending");
    try {
      const sent = await api.submitClaim(idSubmission(form) as ClaimInput);
      setForm(EMPTY_ID_FORM);
      setClaim(sent);
      setPhase("sent");
      haptic("proof.review");
    } catch (err) {
      // A first try that timed out may have gone through: the server then says there's already a
      // request (or already an account). Same as sent.
      if (err instanceof ApiError && (err.code === "claim_pending" || err.code === "has_wallet")) {
        setForm(EMPTY_ID_FORM);
        carryOn();
        return;
      }
      haptic("error");
      if (err instanceof ApiError && err.code === "no_match") {
        setForm(EMPTY_ID_FORM);
        setPhase("noMatch");
        return;
      }
      setFailure(err);
      setPhase("form");
    }
  };

  /**
   * On to the request's status. Live, that screen opens whether or not the login got read-only
   * access meanwhile. Practice closes the preview and the status opens once the bar is up.
   */
  function carryOn() {
    void invalidate(qc, "me", "recovery");
    if (practice) {
      setStatusAfterClaim(true);
      router.dismissAll();
    } else router.replace(RECOVERY_HREF.status);
  }

  if (phase === "sending")
    return (
      <ModalScreen hideLeading scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.accent} />
          <Txt v="titleL" align="center" accessibilityRole="header" accessibilityLiveRegion="polite">
            Checking your ID
          </Txt>
          <Txt v="bodyM" color="textMuted" align="center">
            This takes a few seconds. Keep this screen open.
          </Txt>
        </View>
      </ModalScreen>
    );

  if (phase === "sent")
    return (
      <ModalScreen hideLeading footer={<Button label="Continue" onPress={carryOn} armOnMount />}>
        <View style={{ gap: space.xs }}>
          <Txt v="headline" accessibilityRole="header">
            Sent. A person will check it.
          </Txt>
          {claim?.access === "after_approval" ? (
            <Txt v="bodyL">{"A person is checking your ID. You can sign in to your account once they confirm it's you, usually within a day."}</Txt>
          ) : claim?.access === "read_only" ? (
            <Txt v="bodyL">{"You can look around while a person checks it. Money can't move until they confirm it's you, usually within a day."}</Txt>
          ) : (
            <Txt v="bodyL">{"A person checks it, usually within a day. Money can't move until they confirm it's you."}</Txt>
          )}
        </View>
        {claim?.notifiedEmail ? (
          <Txt v="bodyM" color="textMuted">{`We also told the account's email, ${claim.notifiedEmail}, in case this wasn't its owner.`}</Txt>
        ) : null}
        {practice ? <Banner tone="info" title="Practice" body="A pretend person approves this about 20 seconds from now." /> : null}
      </ModalScreen>
    );

  if (phase === "noMatch")
    return (
      <ModalScreen
        back={() => setPhase("form")}
        footer={
          <>
            <Button label="Close" variant="tonal" onPress={close} />
            <Button label="Try another ID" onPress={() => setPhase("form")} armOnMount />
          </>
        }
      >
        <View style={{ gap: space.xs }}>
          <Txt v="headline" accessibilityRole="header">
            No account uses this ID
          </Txt>
          <Txt v="bodyM" color="textMuted">
            Check the type of ID and the number. It has to be the ID that was verified on the account you want back.
          </Txt>
        </View>
      </ModalScreen>
    );

  return (
    <ModalScreen title="Recover your account" onClose={close} footer={<Button label="Send to a person" onPress={() => void submit()} armOnMount />}>
      <View style={{ gap: space.xs }}>
        <Txt v="headline" accessibilityRole="header">
          Show the ID you verified with
        </Txt>
        <Txt v="bodyM" color="textMuted">
          {"If the automatic checks pass, you can look around while a person checks it. Money can't move until they confirm it's you, usually within a day."}
        </Txt>
      </View>
      {failure ? <Banner tone="danger" title="Your request wasn't sent" body={errorMessage(failure)} /> : null}
      <IdForm
        value={form}
        onChange={(next, changed) => {
          setForm(next);
          if (errors[changed as keyof IdFormErrors]) setErrors((x) => ({ ...x, [changed]: undefined }));
        }}
        errors={errors}
        market={market}
        photo="required"
        practice={practice}
        expandable
      />
      <Txt v="caption" color="textMuted">
        {"When a person approves it, this login opens the account and the old login stops working. We tell the account's email either way."}
      </Txt>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.sm, paddingBottom: space.xxxl },
});
