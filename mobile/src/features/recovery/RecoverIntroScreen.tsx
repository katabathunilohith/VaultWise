import { View } from "react-native";
import { router } from "expo-router";
import { Banner, Button, Timeline, Txt } from "@/components/ui";
import { goBack, StepScreen } from "@/features/account/layout";
import { usePracticeMode } from "@/lib/api/practice";
import { space } from "@/theme";
import { AUTH_HREF } from "@/features/auth/routes";
import { RECOVERY_HREF } from "./routes";

/**
 * Recover with an ID (signed out): for someone who can't get into their email any more. They make
 * a new login, show the ID the old account verified, and a person checks it before money can move.
 */
export function RecoverIntroScreen() {
  const practice = usePracticeMode();
  const next = () => (practice ? router.push(RECOVERY_HREF.claim) : router.push(AUTH_HREF.createForRecovery));
  return (
    <StepScreen back={goBack} footer={<Button label={practice ? "Continue" : "Create a new login"} onPress={next} armOnMount />}>
      <View style={{ gap: space.xs }}>
        <Txt v="headline" accessibilityRole="header">
          Recover with an ID
        </Txt>
        <Txt v="bodyL" color="textMuted">
          {"For when you can't get into your email any more. You'll need the ID you verified with when you joined."}
        </Txt>
      </View>
      <Timeline
        steps={[
          { key: "login", title: "Create a new login", detail: "With an email you can get into now.", state: "pending" },
          { key: "id", title: "Show your ID", detail: "A photo of the same ID, and its number if you like.", state: "pending" },
          { key: "person", title: "A person checks it", detail: "Usually within a day. We also tell your old email.", state: "pending" },
          { key: "back", title: "Your account is yours again", detail: "Your old login stops working.", state: "pending" },
        ]}
      />
      <Txt v="bodyM">{"If the automatic checks pass, you can look around while a person checks it. Money can't move until they confirm it's you, usually within a day."}</Txt>
      {practice ? (
        <Banner tone="info" title="Practice" body="There are no logins in Practice, so this skips to the ID step. A pretend person approves it about 20 seconds later." />
      ) : null}
    </StepScreen>
  );
}
