import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CheckIcon, HeadsetIcon, LifebuoyIcon, ReceiptIcon, type Icon } from "@/components/icons";
import { Card, Press, Txt } from "@/components/ui";
import { categoryOf, emergencyTier, rulesCategory } from "@/lib/categories";
import type { CustomRule, VaultCategory } from "@/lib/api/types";
import { CUSTOM_RULES_ENABLED, customUnlock } from "@/features/custom-rules"; // custom-rules
import { layout, space, useTheme } from "@/theme";
import { useReleaseRules } from "./hooks";

/**
 * "How this vault unlocks": the release contract, shown before money goes in and on the vault
 * itself. A lock is a promise, not a trap — what unlocks it, the emergency route, hold times and
 * a person who can always check.
 */
export function ReleaseContract({
  category,
  template,
  customRule,
  showSupportLink = true,
}: {
  category: VaultCategory | string;
  template?: VaultCategory | string | null;
  /** custom-rules: the vault's own rule, if it has one. */
  customRule?: CustomRule | null;
  showSupportLink?: boolean;
}) {
  const { c } = useTheme();
  const rules = useReleaseRules();
  const meta = categoryOf(category);
  // A custom vault follows the unlock rules of the template it borrowed.
  const rulesFrom = categoryOf(rulesCategory({ category, template }));
  // The emergency tier follows the vault's own category, as on the server: a custom vault that
  // borrows Health's bill rules still pays out as Tier 2.
  const tier1 = emergencyTier(category) === 1;
  // custom-rules: a custom vault lists its own rule (or the choice between one and a borrowed rule).
  const own = customUnlock(category, template, customRule, { enabled: CUSTOM_RULES_ENABLED, reviewSlaHours: rules.reviewSlaHours });
  const items = own?.items ?? rulesFrom.unlocksFor;
  const pause = rules.tier2HoldSeconds >= 120 ? `${Math.round(rules.tier2HoldSeconds / 60)}-minute` : `${rules.tier2HoldSeconds}-second`;

  return (
    <Card>
      <Txt v="titleL" accessibilityRole="header">
        How this vault unlocks
      </Txt>
      {own && customRule ? (
        <Txt v="bodyM" color="textMuted">
          Follows your own rule.
        </Txt>
      ) : rulesFrom !== meta ? (
        <Txt v="bodyM" color="textMuted">
          Follows the {rulesFrom.label} rules.
        </Txt>
      ) : null}

      <Section icon={ReceiptIcon} title="With a matching bill">
        {items.map((item) => (
          <View key={item} style={styles.bullet}>
            <CheckIcon size={16} color={c.text} weight="bold" />
            <Txt v="bodyM" style={{ flex: 1 }}>
              {item}
            </Txt>
          </View>
        ))}
        <Txt v="bodyM" color="textMuted">
          {own
            ? own.note
            : `Add the bill within 24 hours of asking. It's checked in about 4 seconds. Anything unclear goes to a person, usually within ${rules.reviewSlaHours} hours.`}
        </Txt>
      </Section>

      <Section icon={LifebuoyIcon} title="In an emergency">
        <Txt v="bodyM" color="textMuted">
          {tier1
            ? `Tier 1: the money is yours straight away. Add the receipt within ${rules.receiptWindowDays} days.`
            : `Tier 2: released after your PIN and a ${pause} safety pause you can cancel. Add the receipt within ${rules.receiptWindowDays} days.`}
        </Txt>
      </Section>

      <Section icon={HeadsetIcon} title="A person can always check">
        <Txt v="bodyM" color="textMuted">
          If a decision looks wrong, ask and someone reviews it.
        </Txt>
        {showSupportLink ? (
          <Press
            onPress={() => router.push("/support")}
            accessibilityRole="link"
            accessibilityLabel="Talk to a person"
            hitSlop={8}
            style={styles.link}
          >
            <Txt v="labelM" color="accent">
              Talk to a person
            </Txt>
          </Press>
        ) : null}
      </Section>
    </Card>
  );
}

function Section({ icon: IconCmp, title, children }: { icon: Icon; title: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.section}>
      <View style={[styles.iconTile, { backgroundColor: c.surfaceRaised }]}>
        <IconCmp size={20} color={c.text} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Txt v="labelL">{title}</Txt>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flexDirection: "row", gap: space.sm, paddingTop: space.xs },
  iconTile: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  bullet: { flexDirection: "row", alignItems: "center", gap: 8 },
  link: { minHeight: layout.hit, justifyContent: "center", alignSelf: "flex-start" },
});
