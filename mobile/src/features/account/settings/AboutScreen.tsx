import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ArrowUpRightIcon } from "@/components/icons";
import { PRACTICE_ONLY } from "@/lib/build";
import { versionLine } from "@/lib/version";
import { Banner, Button, PracticeBadge, Segmented, Txt } from "@/components/ui";
import { radius, space, useTheme } from "@/theme";
import { Page } from "../layout";

type Doc = "privacy" | "terms" | "about";
const DOCS: { value: Doc; label: string }[] = [
  { value: "privacy", label: "Privacy" },
  { value: "terms", label: "Terms" },
  { value: "about", label: "About" },
];

/**
 * Where the full policies live: the online server's /privacy and /terms pages (src/app/privacy, src/app/terms),
 * when this build has a server address (EXPO_PUBLIC_API_URL, e.g. the tester-live build). Practice-only builds
 * keep everything on the phone, so they show the in-app summary only.
 */
const POLICY_SITE = !PRACTICE_ONLY && process.env.EXPO_PUBLIC_API_URL ? process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "") : null;

const PRIVACY_PRACTICE = [
  "Practice runs on pretend money kept on this phone. No real money moves.",
  "Your vaults and activity are saved on this phone. Nothing about them is sent to our server.",
  "No photo goes to an AI service: in Practice, bill checks and the assistant are simulated on the phone.",
  "To remove it all, use Settings, then Delete account, or delete the app.",
  "We don't sell your data or use it for ads.",
];

const PRIVACY_LIVE = [
  "We collect what the app needs: your name, email and country, your PIN (only as a scrambled hash) and what you do in the app.",
  "ID checks keep the last 4 characters of the number and a keyed hash, never the full number. A rejected ID photo is deleted straight away.",
  "AI reading only with your yes: bill and ID photos and assistant questions go to Groq to be read. Say no and a person on our team reads them instead.",
  "Sign-in runs on Google Firebase. Our server is in Mumbai, India, on an encrypted disk.",
  "We don't sell your data or use it for ads.",
  "Close your account any time in Settings. Its records are deleted within 90 days, and backups roll off 14 days after that.",
];

const TERMS = [
  "Vaultwise is a student prototype. All money in it is pretend: nothing here is a bank account, a payment, an investment or financial advice.",
  "You must be 18 or older, give your own true details, and only upload your own ID and bills.",
  "Keep your password and PIN to yourself. Anything done with them is treated as done by you.",
  "Don't try to get into other people's accounts or get round PINs, limits or checks.",
  "The investing screens, tips and the AI assistant are for learning only, and the AI can make mistakes.",
  "Vaultwise may change, go offline or be reset without notice. It's free and provided as is.",
];

/** Privacy policy, Terms and app info: a short summary, plus the full text on the website when there is one. */
export function AboutScreen() {
  const params = useLocalSearchParams<{ doc?: string }>();
  const [doc, setDoc] = useState<Doc>(DOCS.some((d) => d.value === params.doc) ? (params.doc as Doc) : "about");
  return (
    <Page title="Help & legal">
      <Segmented value={doc} options={DOCS} onChange={setDoc} />
      {doc === "privacy" ? (
        <Policy
          title="Privacy policy"
          points={POLICY_SITE ? PRIVACY_LIVE : PRIVACY_PRACTICE}
          path="/privacy"
          linkLabel="Read the full privacy policy"
        />
      ) : doc === "terms" ? (
        <Policy title="Terms of use" points={TERMS} path="/terms" linkLabel="Read the full terms" />
      ) : (
        <About />
      )}
    </Page>
  );
}

async function openPage(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url).catch(() => {});
  }
}

function Policy({ title, points, path, linkLabel }: { title: string; points: string[]; path: string; linkLabel: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.md }}>
      <Txt v="headline" accessibilityRole="header">
        {title}
      </Txt>
      {PRACTICE_ONLY && <Banner tone="info" title="This is the Practice version" body="It keeps your data on this phone. This is a short summary." />}
      <View style={[styles.paper, { backgroundColor: c.paper, borderColor: c.border }]}>
        <Txt v="titleM" color={c.ink}>
          In short
        </Txt>
        {points.map((p) => (
          <View key={p} style={styles.point}>
            <Txt v="bodyM" color={c.ink} accessibilityElementsHidden importantForAccessibility="no">
              •
            </Txt>
            <Txt v="bodyM" color={c.ink} style={styles.pointText}>
              {p}
            </Txt>
          </View>
        ))}
      </View>
      {POLICY_SITE && (
        <Button
          label={linkLabel}
          variant="tonal"
          icon={ArrowUpRightIcon}
          onPress={() => openPage(`${POLICY_SITE}${path}`)}
          accessibilityHint="Opens the full text on the Vaultwise website"
        />
      )}
    </View>
  );
}

function About() {
  const version = versionLine();
  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: space.xs }}>
        <Txt v="headline" accessibilityRole="header">
          Vaultwise
        </Txt>
        <Txt v="bodyM" color="textMuted">
          Version {version}
        </Txt>
        <PracticeBadge />
      </View>
      <Txt v="bodyM">
        Savings vaults locked to a purpose. Show proof and the money unlocks; in an emergency it never waits.{" "}
        {PRACTICE_ONLY
          ? "This build is a practice version: balances are simulated and no real money moves."
          : "Vaultwise is a student prototype: balances are simulated and no real money moves."}
      </Txt>
      <View style={{ gap: space.xs }}>
        <Txt v="titleM" accessibilityRole="header">
          Credits
        </Txt>
        <Txt v="bodyM" color="textMuted">
          Icons: Phosphor (MIT). 3D objects: Microsoft Fluent Emoji (MIT). Type: Bricolage Grotesque, Figtree and Geist Mono (SIL Open Font
          License).
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.sm },
  point: { flexDirection: "row", gap: space.sm },
  pointText: { flex: 1 },
});
