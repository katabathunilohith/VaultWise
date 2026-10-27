import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Banner, Button, ListRow, Txt } from "@/components/ui";
import { Group } from "@/features/account/controls";
import { goBack, StepScreen } from "@/features/account/layout";
import { RECOVERY_ENABLED } from "@/features/recovery/config";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { usePracticeMode } from "@/lib/api/practice";
import { authErrorMessage, sendResetEmail } from "@/lib/auth/firebase";
import { haptic } from "@/lib/haptics";
import { space } from "@/theme";
import { IdentificationCardIcon } from "../kyc/icons";
import { EmailField, isEmail } from "./fields";
import { AUTH_HREF } from "./routes";

/**
 * Forgot password: Firebase emails a reset link. The answer is the same whether or not an account
 * uses the address, so this screen never reveals who has an account. Practice sends nothing.
 */
export function ForgotPasswordScreen() {
  const practice = usePracticeMode();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ simulated: boolean } | null>(null);

  const submit = async () => {
    setFailure(null);
    if (!isEmail(email)) {
      haptic("error");
      setError(email.trim() ? "This doesn't look like an email address." : "Add the email you sign in with.");
      return;
    }
    setBusy(true);
    try {
      if (practice) {
        const r = await api.resetPassword({ email: email.trim() });
        setSent({ simulated: !!r.simulated });
      } else {
        await sendResetEmail(email);
        setSent({ simulated: false });
      }
    } catch (e) {
      haptic("error");
      setFailure(practice ? errorMessage(e) : authErrorMessage(e, "The link wasn't sent. Try again."));
    } finally {
      setBusy(false);
    }
  };

  if (sent)
    return (
      <StepScreen back={goBack} footer={<Button label="Back to sign in" onPress={() => router.dismissTo(AUTH_HREF.welcome)} armOnMount />}>
        <View style={{ gap: space.xs }}>
          <Txt v="headline" accessibilityRole="header">
            Check your email
          </Txt>
          <Txt v="bodyL" accessibilityLiveRegion="polite">
            If an account uses this email, a reset link is on its way.
          </Txt>
          <Txt v="bodyM" color="textMuted">
            It can take a few minutes. Check your spam folder too. The link works once.
          </Txt>
        </View>
        {sent.simulated ? <Banner tone="info" title="Nothing was sent" body="This is Practice, so no email goes out." /> : null}
      </StepScreen>
    );

  return (
    <StepScreen back={goBack} keyboard footer={<Button label="Send reset link" loading={busy} onPress={() => void submit()} armOnMount />}>
      <View style={{ gap: space.xs }}>
        <Txt v="headline" accessibilityRole="header">
          Reset your password
        </Txt>
        <Txt v="bodyM" color="textMuted">
          {"Type the email you sign in with. We'll send a link to choose a new password."}
        </Txt>
      </View>
      <EmailField
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (error) setError(null);
        }}
        returnKeyType="send"
        onSubmitEditing={() => void submit()}
        error={error}
        editable={!busy}
      />
      {failure ? <Banner tone="danger" title="The link wasn't sent" body={failure} /> : null}
      {RECOVERY_ENABLED ? (
        <Group title="Can't get into this email?">
          <ListRow
            icon={IdentificationCardIcon}
            title="Recover with an ID"
            subtitle="Show the ID you verified with to a person"
            onPress={() => router.push(AUTH_HREF.recover)}
          />
        </Group>
      ) : null}
    </StepScreen>
  );
}
