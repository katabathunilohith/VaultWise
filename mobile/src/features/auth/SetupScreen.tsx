import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { UserCircleIcon } from "@/components/icons";
import { Banner, Button, ListRow, ScreenSkeleton, StatusPill, Txt } from "@/components/ui";
import { Group } from "@/features/account/controls";
import { StepScreen } from "@/features/account/layout";
import { getDraft, saveDraft } from "@/features/account/onboarding/draft";
import { RECOVERY_ENABLED } from "@/features/recovery/config";
import { takeRecoverAfterSignUp } from "@/features/recovery/intent";
import { useRecoveryClaim } from "@/features/recovery/queries";
import { useQueryClient } from "@tanstack/react-query";
import { invalidate } from "@/lib/api/keys";
import { useAuthState } from "@/lib/auth/firebase";
import { space, useTheme } from "@/theme";
import { IdentificationCardIcon } from "../kyc/icons";
import { signOutOfVaultwise } from "./gate";
import { RECOVERY_HREF } from "@/features/recovery/routes";

/**
 * Signed in, but this login has no Vaultwise account yet: set one up (the usual onboarding, with
 * the login's email filled in), or get an old account back with the ID it verified. While a
 * recovery request waits for a person with no access yet ("after_approval"), this shows that
 * request instead, and never onboarding (the server would refuse a second account anyway).
 */
export function SetupScreen() {
  const { c } = useTheme();
  const { user } = useAuthState();
  const qc = useQueryClient();
  // A request waiting with no access is watched, so approval opens the account by itself.
  const claim = useRecoveryClaim({ enabled: RECOVERY_ENABLED, watch: true });
  const claimStatus = claim.data?.status;
  useEffect(() => {
    if (claimStatus === "approved") void invalidate(qc, "me");
  }, [claimStatus, qc]);
  const [leaving, setLeaving] = useState(false);

  // "Recover with an ID" made this login a moment ago: carry on to the ID step.
  useEffect(() => {
    if (takeRecoverAfterSignUp()) router.push(RECOVERY_HREF.claim);
  }, []);

  const setUp = () => {
    const d = getDraft();
    // The server takes the email from the sign-in; it's filled in so the form shows it.
    if (!d.email && user?.email) saveDraft({ ...d, email: user.email });
    router.push("/onboarding");
  };

  const last = claim.data;
  const waiting = last?.status === "pending";
  // Don't offer a new account until it's known whether a request is waiting.
  const checking = RECOVERY_ENABLED && claim.isPending;
  const signOut = (
    <Button
      label="Sign out"
      variant="ghost"
      size="md"
      loading={leaving}
      onPress={() => {
        setLeaving(true);
        void signOutOfVaultwise();
      }}
    />
  );
  const who = (
    <View style={[styles.who, { backgroundColor: c.surface, borderColor: c.border }]} accessible accessibilityLabel={`Signed in as ${user?.email ?? "you"}`}>
      <UserCircleIcon size={28} color={c.textMuted} />
      <View style={{ flex: 1 }}>
        <Txt v="caption" color="textMuted">
          Signed in as
        </Txt>
        <Txt v="labelL" numberOfLines={1}>
          {user?.email ?? "your login"}
        </Txt>
      </View>
    </View>
  );

  if (checking)
    return (
      <StepScreen footer={signOut}>
        {who}
        <ScreenSkeleton />
      </StepScreen>
    );

  if (waiting)
    return (
      <StepScreen
        footer={
          <>
            {signOut}
            <Button label="See details" onPress={() => router.push(RECOVERY_HREF.status)} armOnMount />
          </>
        }
      >
        {who}
        <View style={{ gap: space.xs }}>
          <StatusPill tone="info" label="Being checked" />
          <Txt v="headline" accessibilityRole="header">
            A person is checking your ID
          </Txt>
          <Txt v="bodyL" color="textMuted">
            {"You can sign in to your account once they confirm it's you, usually within a day. This screen updates by itself."}
          </Txt>
        </View>
        {last.notifiedEmail ? (
          <Txt v="bodyM" color="textMuted">{`We told the account's email, ${last.notifiedEmail}, about this request.`}</Txt>
        ) : null}
      </StepScreen>
    );

  return (
    <StepScreen
      footer={
        <>
          {signOut}
          <Button label="Set up my account" onPress={setUp} armOnMount />
        </>
      }
    >
      {who}
      <View style={{ gap: space.xs }}>
        <Txt v="headline" accessibilityRole="header">
          Set up Vaultwise
        </Txt>
        <Txt v="bodyL" color="textMuted">
          Your login works. Now set up your account. It takes a minute.
        </Txt>
      </View>

      {last?.status === "rejected" ? (
        <Banner tone="warning" title="Your recovery request wasn't approved" body={last.reasons[0] ?? "A person couldn't confirm the account is yours."} />
      ) : last?.status === "expired" ? (
        <Banner tone="warning" title="Your recovery request ran out" body="Nobody could check it within 7 days. You can send a new one." />
      ) : null}

      {RECOVERY_ENABLED ? (
        <Group title="Had an account before?">
          <ListRow
            icon={IdentificationCardIcon}
            title="Get my old account back"
            subtitle="Show the ID you verified with. A person checks it."
            onPress={() => router.push(RECOVERY_HREF.claim)}
          />
        </Group>
      ) : null}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginTop: space.md },
});
