import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { CheckCircleIcon, UsersIcon } from "@/components/icons";
import { Card, Chip, Divider, Press, Stack, ToggleRow, Txt } from "@/components/ui";
import { CATEGORIES, categoryOf } from "@/lib/categories";
import type { VaultCategory } from "@/lib/api/types";
import { moneyWhole } from "@/lib/money";
import { radius, space, useTheme } from "@/theme";
import { TextField } from "./fields";
import { formatDate, parseIsoDate, ruleFromDraft, ruleLine, TEMPLATES, type RuleDraft } from "./format";

const PURPOSES: VaultCategory[] = ["health", "education", "housing", "emergency", "retirement", "custom"];

const BLURB: Record<VaultCategory, string> = {
  health: "Bills, pharmacy, tests",
  education: "Fees, books, exams",
  housing: "Rent, deposits, lease",
  emergency: "Repairs, urgent travel",
  retirement: "Pension, later life",
  custom: "Your goal, borrowed rules",
};

const NAME_IDEAS: Record<VaultCategory, string> = {
  health: "Family health fund",
  education: "Maya's college fund",
  housing: "Apartment deposit",
  emergency: "Rainy day fund",
  retirement: "Retirement top-up",
  custom: "Wedding fund",
};

export function StepTitle({ title, body }: { title: string; body?: string }) {
  return (
    <View style={{ gap: space.xxs }}>
      <Txt v="headline" accessibilityRole="header">
        {title}
      </Txt>
      {body ? (
        <Txt v="bodyM" color="textMuted">
          {body}
        </Txt>
      ) : null}
    </View>
  );
}

/* ---------- 1 · purpose ---------- */

export function PurposeStep({
  category,
  template,
  onCategory,
  onTemplate,
}: {
  category: VaultCategory | null;
  template: VaultCategory | null;
  onCategory: (c: VaultCategory) => void;
  onTemplate: (c: VaultCategory) => void;
}) {
  return (
    <Stack gap={space.lg}>
      <StepTitle title="What's it for?" body="The purpose decides which bills can unlock it." />
      <View accessibilityRole="radiogroup" accessibilityLabel="Purpose" style={styles.grid}>
        {PURPOSES.map((k) => (
          <PurposeTile key={k} category={k} selected={category === k} onPress={() => onCategory(k)} />
        ))}
      </View>
      {category === "custom" ? (
        <Stack gap={space.sm}>
          <Txt v="titleM" accessibilityRole="header">
            Which rules should it follow?
          </Txt>
          <Txt v="bodyM" color="textMuted">
            A custom vault unlocks with the same kind of bill as the template you pick.
          </Txt>
          <View accessibilityRole="radiogroup" accessibilityLabel="Template" style={styles.grid}>
            {TEMPLATES.map((t) => {
              const meta = CATEGORIES[t];
              return (
                <View key={t} style={styles.cell}>
                  <Chip tall icon={meta.Icon} label={meta.label} selected={template === t} onPress={() => onTemplate(t)} />
                </View>
              );
            })}
          </View>
        </Stack>
      ) : null}
    </Stack>
  );
}

function PurposeTile({ category, selected, onPress }: { category: VaultCategory; selected: boolean; onPress: () => void }) {
  const { c, cat } = useTheme();
  const meta = CATEGORIES[category];
  const fill = cat(category).fill;
  return (
    <Press
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${meta.label}. ${BLURB[category]}`}
      hapticOnPressIn="select.tick"
      onPress={onPress}
      scaleTo={0.97}
      style={[styles.tile, { backgroundColor: selected ? fill : c.surface, borderColor: selected ? fill : c.border }]}
    >
      <Image source={meta.object3d} style={styles.tileObject} contentFit="contain" accessible={false} />
      <Txt v="titleM" color={selected ? "ink" : "text"}>
        {meta.label}
      </Txt>
      <Txt v="caption" color={selected ? "ink" : "textMuted"} numberOfLines={2}>
        {BLURB[category]}
      </Txt>
      {selected ? (
        <View style={styles.tick}>
          <CheckCircleIcon size={22} color={c.ink} weight="fill" />
        </View>
      ) : null}
    </Press>
  );
}

/* ---------- 2 · name ---------- */

export function NameStep({
  category,
  name,
  onName,
  joint,
  onJoint,
  member,
  onMember,
  onSubmit,
}: {
  category: VaultCategory;
  name: string;
  onName: (v: string) => void;
  joint: boolean;
  onJoint: (v: boolean) => void;
  member: string;
  onMember: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Stack gap={space.lg}>
      <StepTitle title="Name it" body="Something you'll recognise at a glance." />
      <TextField
        label="Vault name"
        value={name}
        onChangeText={onName}
        placeholder={NAME_IDEAS[category]}
        maxLength={50}
        autoCapitalize="sentences"
        returnKeyType={joint ? "next" : "done"}
        onSubmitEditing={joint ? undefined : onSubmit}
      />
      <Card>
        <ToggleRow
          icon={UsersIcon}
          title="Save with someone"
          subtitle="A joint vault. You both see it and what each of you adds."
          value={joint}
          onChange={onJoint}
        />
        {joint ? (
          <TextField
            label="Their name"
            value={member}
            onChangeText={onMember}
            placeholder="Sam Morgan"
            maxLength={50}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={onSubmit}
            hint="In Practice mode they're added by name only; nobody is invited."
          />
        ) : null}
      </Card>
    </Stack>
  );
}

/* ---------- 5 · review ---------- */

export function ReviewSummary({
  category,
  template,
  name,
  member,
  target,
  targetDate,
  rule,
  currency,
}: {
  category: VaultCategory;
  template: VaultCategory | null;
  name: string;
  member: string | null;
  target: number;
  targetDate: string | null;
  rule: RuleDraft;
  currency: string;
}) {
  const meta = categoryOf(category);
  const date = targetDate ? parseIsoDate(targetDate) : null;
  return (
    <Card>
      <View style={styles.summaryHead}>
        <Image source={meta.object3d} style={styles.summaryObject} contentFit="contain" accessible={false} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="titleL" numberOfLines={2}>
            {name}
          </Txt>
          <Txt v="bodyM" color="textMuted">
            {meta.label}
            {category === "custom" && template ? ` · ${categoryOf(template).label} rules` : ""}
            {member ? ` · With ${member}` : ""}
          </Txt>
        </View>
      </View>
      <Divider />
      <SummaryLine label="Goal" value={`${moneyWhole(target, currency)}${date ? ` by ${formatDate(date)}` : ""}`} />
      <Divider />
      <SummaryLine label="Auto-save" value={ruleLine(ruleFromDraft(rule), currency)} />
    </Card>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label}: ${value}`}>
      <Txt v="bodyM" color="textMuted">
        {label}
      </Txt>
      <Txt v="labelL" style={{ flex: 1, textAlign: "right" }} numberOfLines={2}>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cell: { flexBasis: "47%", flexGrow: 1 },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 148,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: space.md,
    gap: 4,
  },
  tileObject: { width: 56, height: 56, marginBottom: space.xs },
  tick: { position: "absolute", top: space.sm, right: space.sm },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  summaryObject: { width: 56, height: 56 },
  line: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48 },
});
