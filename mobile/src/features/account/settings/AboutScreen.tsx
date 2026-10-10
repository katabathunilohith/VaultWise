import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { useLocalSearchParams } from "expo-router";
import { Banner, PracticeBadge, Segmented, Txt } from "@/components/ui";
import { radius, space, useTheme } from "@/theme";
import { Page } from "../layout";

type Doc = "privacy" | "terms" | "about";
const DOCS: { value: Doc; label: string }[] = [
  { value: "privacy", label: "Privacy" },
  { value: "terms", label: "Terms" },
  { value: "about", label: "About" },
];

/** Privacy policy, Terms and app info. The legal text is a clearly marked placeholder. */
export function AboutScreen() {
  const params = useLocalSearchParams<{ doc?: string }>();
  const [doc, setDoc] = useState<Doc>(DOCS.some((d) => d.value === params.doc) ? (params.doc as Doc) : "about");
  return (
    <Page title="Help & legal">
      <Segmented value={doc} options={DOCS} onChange={setDoc} />
      {doc === "privacy" ? <Policy title="Privacy policy" /> : doc === "terms" ? <Policy title="Terms of use" /> : <About />}
    </Page>
  );
}

function Policy({ title }: { title: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.md }}>
      <Txt v="headline" accessibilityRole="header">
        {title}
      </Txt>
      <Banner tone="warning" title="Placeholder text" body="The final legal text hasn't been written yet. Nothing here is a real policy." />
      <View style={[styles.paper, { backgroundColor: c.paper, borderColor: c.border }]}>
        <Txt v="titleM" color={c.ink}>
          [YOUR POLICY HERE]
        </Txt>
        <Txt v="bodyM" color={c.ink}>
          Replace this with the {title.toLowerCase()} before publishing. It needs to cover what’s collected, why, who it’s shared with (the Vaultwise
          server and Groq, the AI provider), how long it’s kept, and how to export or delete it.
        </Txt>
      </View>
    </View>
  );
}

function About() {
  const version = Constants.expoConfig?.version ?? "—";
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
        Savings vaults locked to a purpose. Show proof and the money unlocks; in an emergency it never waits. This build is a practice version: balances
        are simulated and no real money moves.
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
});
