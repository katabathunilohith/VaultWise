import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { EnvelopeSimpleIcon } from "@/components/icons";
import { Banner, Button, Card, Txt, useHardwareBack } from "@/components/ui";
import { goBack, StepScreen } from "@/features/account/layout";
import { checkIdForm, EMPTY_ID_FORM, IdForm, idSubmission, type IdFormErrors, type IdFormValue } from "@/features/kyc/IdForm";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { FindAccountResult } from "@/lib/api/identity-types";
import { usePracticeMode } from "@/lib/api/practice";
import { haptic } from "@/lib/haptics";
import { space, useTheme } from "@/theme";
import { useIdMarket } from "./market";
import { AUTH_HREF } from "@/features/auth/routes";
import { ensureAiAnswer } from "@/features/ai-consent"; // ai-consent

type Phase = { kind: "form" } | { kind: "answer"; result: FindAccountResult } | { kind: "sent"; maskedEmail: string; simulated: boolean };

/**
 * Find my account (signed out): show the ID the account verified with, by photo or by number.
 * The answer is the account's email, masked, and a reset link can go to it without the phone ever
 * seeing the full address. Five tries an hour per phone.
 */
export function FindAccountScreen() {
  const practice = usePracticeMode();
  const market = useIdMarket();
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [form, setForm] = useState<IdFormValue>(EMPTY_ID_FORM);
  const [errors, setErrors] = useState<IdFormErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const back = phase.kind === "answer" ? () => setPhase({ kind: "form" }) : goBack;
  useHardwareBack(busy ? "block" : phase.kind === "answer" ? () => setPhase({ kind: "form" }) : null);

  const find = async () => {
    const e = checkIdForm(form, { photo: "either", market: null });
    setErrors(e);
    if (Object.keys(e).length) {
      haptic("error");
      return;
    }
    // ai-consent: a photo of the ID may go to the AI, so ask once first; a typed number alone doesn't.
    if (form.photo && !(await ensureAiAnswer())) return;
    setFailure(null);
    setBusy(true);
    try {
      const result = await api.findAccount(idSubmission(form));
      setForm(EMPTY_ID_FORM);
      setPhase({ kind: "answer", result });
    } catch (err) {
      haptic("error");
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async (result: FindAccountResult) => {
    if (!result.findToken || !result.maskedEmail) return;
    setFailure(null);
    setBusy(true);
    try {
      const r = await api.resetPassword({ findToken: result.findToken });
      setPhase({ kind: "sent", maskedEmail: result.maskedEmail, simulated: !!r.simulated });
    } catch (err) {
      haptic("error");
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  if (phase.kind === "sent")
    return (
      <StepScreen back={goBack} footer={<Button label="Back to sign in" onPress={() => router.dismissTo(AUTH_HREF.welcome)} armOnMount />}>
        <Heading title="Check your email" />
        <Txt v="bodyL" accessibilityLiveRegion="polite">
          {`If this is your account, a reset link is on its way to ${phase.maskedEmail}.`}
        </Txt>
        <Txt v="bodyM" color="textMuted">
          It can take a few minutes. Check your spam folder too.
        </Txt>
        {phase.simulated ? <Banner tone="info" title="Nothing was sent" body="This is a practice run, so no email goes out." /> : null}
      </StepScreen>
    );

  if (phase.kind === "answer") {
    const r = phase.result;
    if (!r.found)
      return (
        <StepScreen
          back={back}
          footer={
            <>
              <Button label="Create an account" variant="tonal" onPress={() => router.replace(AUTH_HREF.create)} />
              <Button label="Try another ID" onPress={() => setPhase({ kind: "form" })} armOnMount />
            </>
          }
        >
          <Heading title="No account uses this ID" body="Check the type of ID and the number. Only an ID that was verified on Vaultwise can find an account." />
        </StepScreen>
      );
    if (!r.canReset || !r.maskedEmail || !r.findToken)
      return (
        <StepScreen back={back} footer={<Button label="Recover with an ID" onPress={() => router.replace(AUTH_HREF.recover)} armOnMount />}>
          <Heading title="We found your account" body="It has no email we can send a link to. Recover it with your ID instead: a person checks it." />
        </StepScreen>
      );
    return (
      <StepScreen
        back={back}
        footer={
          <>
            <Button label="I can't get into this email" variant="tonal" onPress={() => router.replace(AUTH_HREF.recover)} />
            <Button label="Send a reset link" loading={busy} onPress={() => void sendLink(r)} armOnMount />
          </>
        }
      >
        <Heading title="We found your account" body="It uses this email. Send a reset link there to choose a new password." />
        <EmailCard masked={r.maskedEmail} />
        {failure ? <Banner tone="danger" title="The link wasn't sent" body={errorMessage(failure)} /> : null}
      </StepScreen>
    );
  }

  return (
    <StepScreen back={back} keyboard footer={<Button label="Find my account" loading={busy} onPress={() => void find()} armOnMount />}>
      <Heading
        title="Find my account"
        body="Show the ID you verified with when you joined. We'll show the email your account uses, partly hidden."
      />
      {failure ? <Banner tone="danger" title="That didn't work" body={errorMessage(failure)} /> : null}
      <IdForm
        value={form}
        onChange={(next, changed) => {
          setForm(next);
          if (errors[changed as keyof IdFormErrors] || (changed !== "docType" && errors.photo)) setErrors((x) => ({ ...x, [changed]: undefined, photo: undefined }));
        }}
        errors={errors}
        market={market}
        photo="either"
        practice={practice}
        disabled={busy}
        expandable
      />
      <Txt v="caption" color="textMuted">
        {practice
          ? "In Practice any ID finds the sample account."
          : "Five tries an hour from this phone. Your ID number is checked, then forgotten: only a scrambled copy is ever compared."}
      </Txt>
    </StepScreen>
  );
}

function Heading({ title, body }: { title: string; body?: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <Txt v="headline" accessibilityRole="header">
        {title}
      </Txt>
      {body ? (
        <Txt v="bodyM" color="textMuted">
          {body}
        </Txt>
      ) : null}
    </View>
  );
}

function EmailCard({ masked }: { masked: string }) {
  const { c } = useTheme();
  const spoken = masked.replace("***", " hidden letters ");
  return (
    <Card>
      <View style={styles.email} accessible accessibilityLabel={`Email: ${spoken}`}>
        <EnvelopeSimpleIcon size={24} color={c.textMuted} />
        <Txt v="numM" style={{ flex: 1 }}>
          {masked}
        </Txt>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  email: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40 },
});
