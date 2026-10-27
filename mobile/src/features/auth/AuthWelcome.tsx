import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { LockKeyIcon, MagnifyingGlassIcon } from "@/components/icons";
import { Banner, Button, ListRow, Txt } from "@/components/ui";
import { Group } from "@/features/account/controls";
import { goBack, StepScreen } from "@/features/account/layout";
import { RECOVERY_ENABLED } from "@/features/recovery/config";
import { applyConnection } from "@/lib/api/connection";
import { usePracticeMode } from "@/lib/api/practice";
import { useAuthState } from "@/lib/auth/firebase";
import { space, useTheme } from "@/theme";
import { IdentificationCardIcon, KeyIcon } from "../kyc/icons";
import { AUTH_HREF } from "./routes";

/**
 * Signed out (live, with sign-in on): sign in, create a login, get back in without a password or
 * without the email, or look around Practice with no account. In Practice the same screen is a
 * preview opened from Settings, and nothing on it signs anyone in.
 */
export function AuthWelcome() {
  const { c } = useTheme();
  const practice = usePracticeMode();
  const { notice, enabled } = useAuthState();
  return (
    <StepScreen
      close={practice ? goBack : undefined}
      footer={
        <>
          <Button label="Create an account" variant="tonal" onPress={() => router.push(AUTH_HREF.create)} />
          <Button label="Sign in" onPress={() => router.push(AUTH_HREF.signIn)} armOnMount />
        </>
      }
    >
      <View style={styles.brand} accessible accessibilityLabel="Vaultwise">
        <View style={[styles.mark, { backgroundColor: c.surfaceRaised }]}>
          <LockKeyIcon size={26} color={c.text} />
        </View>
        <Txt v="labelL" color="textMuted">
          Vaultwise
        </Txt>
      </View>
      <View style={{ gap: space.xs }}>
        <Txt v="headline" accessibilityRole="header">
          Sign in to Vaultwise
        </Txt>
        <Txt v="bodyL" color="textMuted">
          Your vaults on any phone. Sign in with your email and password.
        </Txt>
      </View>

      {practice ? (
        <Banner
          tone="info"
          title="This is a preview"
          body="In Practice nobody signs in and nothing is sent. Connect to the Vaultwise server to use a real login."
          // "Try Practice without an account" is remembered; this is the way back to the server.
          action={enabled ? { label: "Use my Vaultwise login", onPress: () => void applyConnection("auto") } : undefined}
        />
      ) : notice ? (
        <Banner tone="info" title="You're signed out" body={notice} />
      ) : null}

      <Group title="Can't get in?">
        <ListRow icon={KeyIcon} title="Forgot your password" subtitle="Get an email with a link to set a new one" onPress={() => router.push(AUTH_HREF.forgot)} />
        {RECOVERY_ENABLED ? (
          <ListRow
            icon={MagnifyingGlassIcon}
            title="Find my account"
            subtitle="Forgot which email you used? Find it with your ID"
            onPress={() => router.push(AUTH_HREF.find)}
          />
        ) : null}
        {RECOVERY_ENABLED ? (
          <ListRow
            icon={IdentificationCardIcon}
            title="Recover with an ID"
            subtitle="Can't get into that email any more? Show your ID to a person"
            onPress={() => router.push(AUTH_HREF.recover)}
          />
        ) : null}
      </Group>

      {practice ? null : (
        <View style={{ gap: space.xxs }}>
          <Button
            label="Try Practice without an account"
            variant="ghost"
            size="md"
            accessibilityHint="Opens Vaultwise with sample data on this phone. No real money."
            onPress={() => void applyConnection("demo")}
          />
          <Txt v="caption" color="textMuted" align="center">
            Sample data on this phone. No real money, nothing to sign up for.
          </Txt>
        </View>
      )}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: "flex-start", gap: space.xs, marginTop: space.md },
  mark: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
