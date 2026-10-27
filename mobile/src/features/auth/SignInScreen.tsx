import { useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { router } from "expo-router";
import { Banner, Button, Txt } from "@/components/ui";
import { goBack, StepScreen } from "@/features/account/layout";
import { getConnection } from "@/lib/api/connection";
import { usePracticeMode } from "@/lib/api/practice";
import { authErrorMessage, signInWithEmail } from "@/lib/auth/firebase";
import { haptic } from "@/lib/haptics";
import { space } from "@/theme";
import { EmailField, isEmail, PasswordField } from "./fields";
import { AUTH_HREF } from "./routes";

interface Errors {
  email?: string;
  password?: string;
}

/**
 * Sign in with email and password. On success there's nothing to do here: the root gate sees the
 * new session and opens the account (or account set-up, for a login with no wallet yet).
 */
export function SignInScreen() {
  const practice = usePracticeMode();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewed, setPreviewed] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    const e: Errors = {};
    if (!isEmail(email)) e.email = email.trim() ? "This doesn't look like an email address." : "Add your email address.";
    if (!password) e.password = "Add your password.";
    setErrors(e);
    setFailure(null);
    if (Object.keys(e).length) {
      haptic("error");
      return;
    }
    if (practice) {
      setPreviewed(true);
      return;
    }
    setBusy(true);
    try {
      await signInWithEmail(email, password, getConnection().baseUrl);
      // The gate takes over from here.
    } catch (err) {
      haptic("error");
      setFailure(authErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <StepScreen back={goBack} keyboard footer={<Button label="Sign in" loading={busy} onPress={() => void submit()} armOnMount />}>
      <View style={{ gap: space.xs }}>
        <Txt v="headline" accessibilityRole="header">
          Sign in
        </Txt>
        <Txt v="bodyM" color="textMuted">
          Use the email and password of your Vaultwise login.
        </Txt>
      </View>
      <EmailField
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (errors.email) setErrors((x) => ({ ...x, email: undefined }));
        }}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={errors.email}
        editable={!busy}
      />
      <PasswordField
        ref={passwordRef}
        purpose="current"
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          if (errors.password) setErrors((x) => ({ ...x, password: undefined }));
        }}
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        error={errors.password}
        editable={!busy}
      />
      {failure ? <Banner tone="danger" title="You're not signed in" body={failure} /> : null}
      {previewed ? <Banner tone="info" title="Practice preview" body="In Practice nobody signs in, so nothing was checked or sent." /> : null}
      <Button label="Forgot your password?" variant="ghost" size="sm" onPress={() => router.push(AUTH_HREF.forgot)} style={{ alignSelf: "flex-start" }} />
    </StepScreen>
  );
}
