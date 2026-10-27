import { useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Banner, Button, Txt } from "@/components/ui";
import { goBack, StepScreen } from "@/features/account/layout";
import { setRecoverAfterSignUp } from "@/features/recovery/intent";
import { getConnection } from "@/lib/api/connection";
import { usePracticeMode } from "@/lib/api/practice";
import { authErrorMessage, createAccountWithEmail } from "@/lib/auth/firebase";
import { haptic } from "@/lib/haptics";
import { space } from "@/theme";
import { EmailField, isEmail, PasswordField, passwordOk, PasswordRules } from "./fields";
import { RECOVERY_HREF } from "@/features/recovery/routes";

interface Errors {
  email?: string;
  password?: string;
}

/**
 * Create a login (email and password). Next comes account set-up, or, when this login is for
 * recovering an old account (`?intent=recover`), the ID step.
 */
export function CreateAccountScreen() {
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const recover = intent === "recover";
  const practice = usePracticeMode();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    const e: Errors = {};
    if (!isEmail(email)) e.email = email.trim() ? "This doesn't look like an email address." : "Add your email address.";
    if (!passwordOk(password)) e.password = "Your password needs at least 8 characters, with a letter and a number.";
    setErrors(e);
    setFailure(null);
    if (Object.keys(e).length) {
      haptic("error");
      return;
    }
    if (practice) {
      // Practice has no logins (the banner says so): a recovery goes straight to the ID step.
      if (recover) router.push(RECOVERY_HREF.claim);
      return;
    }
    setBusy(true);
    setRecoverAfterSignUp(recover);
    try {
      await createAccountWithEmail(email, password, getConnection().baseUrl);
      // Signed in now: the gate opens set-up (and the ID step, for a recovery).
    } catch (err) {
      setRecoverAfterSignUp(false);
      haptic("error");
      setFailure(authErrorMessage(err, "Your login wasn't created. Try again."));
      setBusy(false);
    }
  };

  return (
    <StepScreen
      back={goBack}
      step={recover ? { n: 1, of: 2 } : undefined}
      keyboard
      footer={<Button label={recover ? "Create login and continue" : "Create login"} loading={busy} onPress={() => void submit()} armOnMount />}
    >
      <View style={{ gap: space.xs }}>
        <Txt v="headline" accessibilityRole="header">
          {recover ? "Create a new login" : "Create your login"}
        </Txt>
        <Txt v="bodyM" color="textMuted">
          {recover
            ? "Use an email you can get into now. Next, you'll show the ID you verified with."
            : "You'll sign in with this email and password. Next, you'll set up your account."}
        </Txt>
      </View>
      <EmailField
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (errors.email) setErrors((x) => ({ ...x, email: undefined }));
        }}
        hint="Account notices go here. No marketing unless you turn it on."
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={errors.email}
        editable={!busy}
      />
      <View style={{ gap: space.sm }}>
        <PasswordField
          ref={passwordRef}
          purpose="new"
          label="Choose a password"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            if (errors.password && passwordOk(t)) setErrors((x) => ({ ...x, password: undefined }));
          }}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          error={errors.password}
          editable={!busy}
        />
        <PasswordRules password={password} />
      </View>
      {failure ? <Banner tone="danger" title="Your login wasn't created" body={failure} /> : null}
      {practice && !recover ? (
        <Banner tone="info" title="Practice preview" body="In Practice there are no logins, so nothing is created. Connect to the Vaultwise server to make a real one." />
      ) : null}
    </StepScreen>
  );
}
