import { useEffect, useRef, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReceiptIcon, ShieldCheckIcon, SparkleIcon, type Icon } from "@/components/icons";
import { Button, Txt } from "@/components/ui";
import { layout, radius, space, useTheme } from "@/theme";
import { settleAiAsk } from "./ask";

// Loaded per file, like src/components/icons.ts (the package barrel is large).
const IdentificationCardIcon: Icon = require("phosphor-react-native/src/icons/IdentificationCard").IdentificationCardIcon;

/**
 * The one-time question before a bill or an ID is sent (./ask.ts). Names the AI company and what it
 * gets; "no" means a person reads them instead. Closing the sheet sends nothing.
 */
export function AiConsentSheet() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  // The waiting send carries on only after the sheet has closed, so it can't pop the wrong screen.
  const answer = useRef<"yes" | "no" | null>(null);
  useEffect(() => () => void settleAiAsk(answer.current ?? "cancel"), []);
  const choose = (a: "yes" | "no") => {
    answer.current = a;
    if (router.canGoBack()) router.back();
    else void settleAiAsk(a);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: c.surfaceRaised }]}>
          <ShieldCheckIcon size={24} color={c.text} />
        </View>
        <Txt v="headline" accessibilityRole="header" style={{ flex: 1 }}>
          Can an AI read what you send?
        </Txt>
      </View>
      <Txt v="bodyM">To check them in minutes, Vaultwise sends these to Groq, an AI provider:</Txt>
      <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Item icon={ReceiptIcon}>Bills, receipts and invoices you send as proof</Item>
        <Item icon={IdentificationCardIcon}>Photos of your ID, when you verify who you are</Item>
        <Item icon={SparkleIcon}>A summary of your savings, for your weekly tip</Item>
      </View>
      <Txt v="bodyM" color="textMuted">
        If you say no, a person reads your bills and ID instead, which takes longer. Your weekly tip will be a simpler one.
      </Txt>
      <Txt v="caption" color="textMuted">
        You can change this any time in Settings, under Trust centre.
      </Txt>
      <View style={styles.actions}>
        <Button label="Allow" armOnMount onPress={() => choose("yes")} />
        <Button label="No, use a person" variant="tonal" onPress={() => choose("no")} />
      </View>
    </ScrollView>
  );
}

function Item({ icon: IconCmp, children }: { icon: Icon; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.item}>
      <IconCmp size={20} color={c.textMuted} />
      <Txt v="bodyM" style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, paddingTop: space.xl, gap: space.md, maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  badge: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  list: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.sm },
  item: { flexDirection: "row", alignItems: "center", gap: space.sm },
  actions: { gap: space.sm, marginTop: space.xs },
});
