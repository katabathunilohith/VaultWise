import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { BankIcon, BellIcon, CoinsIcon, ExportIcon, UserIcon, VibrateIcon, type Icon } from "@/components/icons";
import { ListRow, PracticeBadge, ToggleRow, Txt } from "@/components/ui";
import { giveAiConsent, useSession, withdrawAiConsent } from "@/lib/session";
import { radius, space, useTheme } from "@/theme";
import { Group } from "../controls";
import { DoorOpenIcon, ScalesIcon } from "../icons";
import { Page } from "../layout";

/** Plain answers to "is this safe?": who holds the money, shutdown, fees, decisions, data. */
export function TrustScreen() {
  const session = useSession();
  return (
    <Page title="Trust centre">
      <View style={{ gap: space.xs }}>
        <PracticeBadge />
        <Txt v="headline" accessibilityRole="header">
          How Vaultwise keeps its promises
        </Txt>
      </View>

      <Section icon={BankIcon} title="Who holds your money">
        <Para>In Practice mode, nobody does. Balances are simulated and no real money moves.</Para>
        <Para>When Vaultwise launches for real, a licensed partner bank will hold the money, not Vaultwise. We’ll name the bank here first.</Para>
      </Section>

      <Section icon={DoorOpenIcon} title="If Vaultwise shuts down">
        <Para>You’d hear from us in the app and by email before anything changes.</Para>
        <Para>Every vault balance would be paid back to your bank. Locks don’t apply to a wind-down.</Para>
        <Para>You can export all your data at any time, from Settings.</Para>
      </Section>

      <Section icon={CoinsIcon} title="Our fee pledge">
        <Para>Core vaults are free: no fees to open, save, verify proof or take money out.</Para>
        <Para>If we ever add paid extras, they’ll be optional and priced before you choose them.</Para>
      </Section>

      <Section icon={ScalesIcon} title="How decisions are made">
        <Para>AI reads your bill and runs the checks. Anything unclear goes to a person instead of being declined.</Para>
        <Para>Every decision says why. You can always appeal and ask a person to look again.</Para>
      </Section>

      <Section icon={UserIcon} title="Your data">
        <Para>We keep your profile, vaults, history and the documents you send.</Para>
        <Para>It goes to two places: the Vaultwise server, and Groq, an AI provider that reads bills and writes the assistant’s replies.</Para>
        <Para>We don’t sell your data or use it for ads.</Para>
      </Section>

      <Group title="Your controls">
        <ToggleRow
          title="AI assistant"
          subtitle={session.aiConsent ? "On. Your questions go to Groq to write replies." : "Off. Turn on to let Groq write the assistant's replies."}
          value={session.aiConsent}
          onChange={(v) => void (v ? giveAiConsent() : withdrawAiConsent())}
        />
        <ListRow icon={ExportIcon} title="Export or delete your data" subtitle="In Settings, under Account" onPress={() => router.navigate("/settings")} />
        <ListRow icon={VibrateIcon} title="Haptics & sounds" onPress={() => router.push("/settings/haptics")} />
        <ListRow icon={BellIcon} title="Notifications" onPress={() => router.push("/settings/notifications")} />
      </Group>
    </Page>
  );
}

function Section({ icon: IconCmp, title, children }: { icon: Icon; title: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.sectionHead}>
        <View style={[styles.icon, { backgroundColor: c.surfaceRaised }]}>
          <IconCmp size={22} color={c.text} />
        </View>
        <Txt v="titleM" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </Txt>
      </View>
      <View style={{ gap: space.xs }}>{children}</View>
    </View>
  );
}

function Para({ children }: { children: string }) {
  return <Txt v="bodyM">{children}</Txt>;
}

const styles = StyleSheet.create({
  section: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.sm },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
