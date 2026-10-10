import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { HourglassIcon, PlusIcon, RepeatIcon, UsersIcon } from "@/components/icons";
import { Amount, Press, Txt } from "@/components/ui";
import { categoryOf } from "@/lib/categories";
import type { Vault } from "@/lib/api/types";
import { moneyWhole } from "@/lib/money";
import { radius, space, useTheme } from "@/theme";
import { ruleLine } from "./format";

/**
 * Vault card (≥88 pt, whole card tappable): the category fill with ink text, its 3D object,
 * balance, goal bar, rule and any money held for a pending withdrawal.
 */
export function VaultCard({ vault, onPress }: { vault: Vault; onPress: () => void }) {
  const { c, cat } = useTheme();
  const meta = categoryOf(vault.category);
  const fill = cat(meta.key).fill;
  const pct = Math.round(vault.progress * 100);
  const toGo = Math.max(0, vault.target - vault.balance);
  const goalLine =
    vault.progress >= 1
      ? `Goal of ${moneyWhole(vault.target, vault.currency)} reached`
      : vault.progress >= 0.75
        ? `${moneyWhole(toGo, vault.currency)} to go · ${pct}%`
        : `of ${moneyWhole(vault.target, vault.currency)} · ${pct}%`;
  const rule = ruleLine(vault.rule, vault.currency);
  const members = vault.members.length;
  const label = [
    vault.name,
    `${meta.label} vault`,
    vault.isJoint ? `joint${members ? ` with ${members} members` : ""}` : null,
    `${moneyWhole(vault.balance, vault.currency)} saved, ${goalLine}`,
    `auto-save: ${rule}`,
    vault.held > 0 ? `${moneyWhole(vault.held, vault.currency)} held for a pending withdrawal` : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <Press
      onPress={onPress}
      scaleTo={0.98}
      accessibilityLabel={label}
      accessibilityHint="Opens the vault"
      style={[styles.card, { backgroundColor: fill }]}
    >
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={styles.tags}>
            <View style={styles.tag}>
              <meta.Icon size={14} color={c.ink} weight="duotone" />
              <Txt v="caption" color="ink">
                {meta.label}
              </Txt>
            </View>
            {vault.isJoint ? (
              <View style={styles.tag}>
                <UsersIcon size={14} color={c.ink} weight="bold" />
                <Txt v="caption" color="ink">
                  {members ? `Joint · ${members}` : "Joint"}
                </Txt>
              </View>
            ) : null}
          </View>
          <Txt v="titleL" color="ink" numberOfLines={2}>
            {vault.name}
          </Txt>
        </View>
        <Image source={meta.object3d} style={styles.object} contentFit="contain" accessible={false} />
      </View>

      <View style={{ gap: 2 }}>
        <Amount value={vault.balance} currency={vault.currency} size="m" color={c.ink} hideDecimals animate={false} />
        <Txt v="caption" color="ink">
          {goalLine}
        </Txt>
      </View>
      <FillBar value={vault.progress} />

      <View style={{ gap: 4 }}>
        <View style={styles.meta}>
          <RepeatIcon size={16} color={c.ink} />
          <Txt v="caption" color="ink">
            {rule}
          </Txt>
        </View>
        {vault.held > 0 ? (
          <View style={styles.meta}>
            <HourglassIcon size={16} color={c.ink} />
            <Txt v="caption" color="ink" style={{ flex: 1 }}>
              {moneyWhole(vault.held, vault.currency)} held for a pending withdrawal
            </Txt>
          </View>
        ) : null}
      </View>
    </Press>
  );
}

/**
 * Goal bar drawn on a category fill: an ink fill on a translucent ink track, with 25/50/75 ticks.
 * (The kit's ProgressBar uses the theme border for its track, which disappears on vivid fills.)
 */
function FillBar({ value }: { value: number }) {
  const { c } = useTheme();
  const v = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      style={[styles.track, { backgroundColor: `${c.ink}29` }]}
    >
      <View style={[styles.fill, { width: `${v * 100}%`, backgroundColor: c.ink }]} />
      {[0.25, 0.5, 0.75].map((t) => (
        <View key={t} style={[styles.tick, { left: `${t * 100}%`, backgroundColor: v >= t ? "#FFFFFF" : c.ink, opacity: v >= t ? 0.5 : 0.25 }]} />
      ))}
    </View>
  );
}

/** The in-content twin of the header "+": a dashed card at the end of the list. */
export function NewVaultCard({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Press
      onPress={onPress}
      scaleTo={0.98}
      accessibilityLabel="New vault"
      accessibilityHint="Pick a purpose, set a goal and lock it"
      style={[styles.newCard, { borderColor: c.borderStrong }]}
    >
      <View style={[styles.plus, { backgroundColor: c.surfaceRaised }]}>
        <PlusIcon size={22} color={c.text} weight="bold" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="labelL">New vault</Txt>
        <Txt v="bodyM" color="textMuted">
          Pick a purpose, set a goal, lock it in.
        </Txt>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: space.md, gap: space.sm, minHeight: 88 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: "rgba(13,10,14,0.10)",
  },
  object: { width: 64, height: 64 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  track: { height: 8, borderRadius: radius.pill, overflow: "hidden", width: "100%" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: radius.pill },
  tick: { position: "absolute", top: 0, bottom: 0, width: 2, marginLeft: -1 },
  newCard: {
    minHeight: 88,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: "dashed",
    padding: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  plus: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
