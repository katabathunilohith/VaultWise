import { StyleSheet, View } from "react-native";
import { BankIcon, CoinsIcon, HandTapIcon, LightningIcon, RepeatIcon, type Icon } from "@/components/icons";
import { Chip, Txt } from "@/components/ui";
import type { ContributionRule } from "@/lib/api/types";
import { moneyWhole, parseAmount } from "@/lib/money";
import { space, useTheme } from "@/theme";
import { ChoiceRow, TypedAmount } from "./fields";
import { addMonths, formatDate, FREQUENCIES, framing, monthlyFromFixed, parseIsoDate, PERCENT_OPTIONS, toIsoDate, type RuleDraft } from "./format";

/* ---------- goal ---------- */

/** A target-date choice: months from today, the vault's current date, or no date. */
export type DateChoice = 3 | 6 | 12 | 24 | "keep" | "none";

const MONTH_CHOICES: { value: DateChoice; label: string }[] = [
  { value: 3, label: "3 months" },
  { value: 6, label: "6 months" },
  { value: 12, label: "1 year" },
  { value: 24, label: "2 years" },
];

export function dateFromChoice(choice: DateChoice, current: string | null): string | null {
  if (choice === "keep") return current;
  if (choice === "none") return null;
  return toIsoDate(addMonths(new Date(), choice));
}

function monthsUntil(iso: string | null) {
  const d = iso ? parseIsoDate(iso) : null;
  if (!d) return null;
  return Math.max(1, (d.getTime() - Date.now()) / (86_400_000 * 30.44));
}

/** Goal amount (typed on the keypad in the bottom slot) and a target date, with daily framing. */
export function GoalFields({
  amount,
  currency,
  date,
  onDate,
  currentDate = null,
  allowNone = false,
  saved = 0,
}: {
  amount: string;
  currency: string;
  date: DateChoice;
  onDate: (d: DateChoice) => void;
  /** The vault's current target date, when editing. */
  currentDate?: string | null;
  /** Offer "No date" (when editing a vault). */
  allowNone?: boolean;
  /** What's already saved (minor), when editing. */
  saved?: number;
}) {
  const options: { value: DateChoice; label: string }[] = [
    ...(currentDate ? [{ value: "keep" as const, label: `Keep ${formatDate(parseIsoDate(currentDate) ?? new Date())}` }] : []),
    ...MONTH_CHOICES,
    ...(allowNone ? [{ value: "none" as const, label: "No date" }] : []),
  ];
  const target = parseAmount(amount) ?? 0;
  const iso = dateFromChoice(date, currentDate);
  const months = monthsUntil(iso);
  const remaining = target - saved;
  return (
    <View style={{ gap: space.md }}>
      <TypedAmount value={amount} currency={currency} caption="Goal" />
      <View style={{ gap: space.xs }}>
        <Txt v="labelM" color="textMuted">
          Reach it in
        </Txt>
        <ChoiceRow label="Target date" options={options} value={date} onChange={onDate} />
      </View>
      {target > 0 && months && remaining > 0 ? (
        <Framing
          text={framing(remaining / months, currency)}
          sub={iso ? `To reach it by ${formatDate(parseIsoDate(iso) ?? new Date())}` : undefined}
        />
      ) : null}
    </View>
  );
}

/* ---------- contribution rule ---------- */

const RULE_TYPES: { value: ContributionRule["type"]; label: string; icon: Icon; body: string }[] = [
  { value: "none", label: "No auto-save", icon: HandTapIcon, body: "Add money whenever you like." },
  { value: "fixed", label: "Fixed amount", icon: RepeatIcon, body: "The same amount on a schedule." },
  { value: "percent_income", label: "% of payday", icon: BankIcon, body: "A share of each payday, when it lands in your bank." },
  { value: "roundup", label: "Round-ups", icon: CoinsIcon, body: "Card spends round up and the spare change comes here." },
];

/**
 * Contribution rule picker. Fixed amounts are typed on the keypad in the bottom slot; the picker
 * leads with the daily figure and keeps the monthly one visible for honesty.
 */
export function RuleFields({
  draft,
  onChange,
  currency,
  goalMonthly,
}: {
  draft: RuleDraft;
  onChange: (d: RuleDraft) => void;
  currency: string;
  /** What the goal needs each month (minor), to say whether this rule keeps pace. */
  goalMonthly?: number | null;
}) {
  const selected = RULE_TYPES.find((t) => t.value === draft.type) ?? RULE_TYPES[0];
  const fixedMinor = parseAmount(draft.amount) ?? 0;
  const monthly = draft.type === "fixed" && fixedMinor > 0 ? monthlyFromFixed(fixedMinor, draft.frequency) : null;
  return (
    <View style={{ gap: space.md }}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Auto-save" style={styles.grid}>
        {RULE_TYPES.map((t) => (
          <View key={t.value} style={styles.cell}>
            <Chip tall icon={t.icon} label={t.label} selected={draft.type === t.value} onPress={() => onChange({ ...draft, type: t.value })} />
          </View>
        ))}
      </View>
      <Txt v="bodyM" color="textMuted">
        {selected.body}
      </Txt>

      {draft.type === "fixed" ? (
        <View style={{ gap: space.md }}>
          <TypedAmount value={draft.amount} currency={currency} caption="Each time" />
          <ChoiceRow label="How often" options={FREQUENCIES} value={draft.frequency} onChange={(frequency) => onChange({ ...draft, frequency })} />
          {monthly ? (
            <Framing
              text={framing(monthly, currency)}
              sub={
                goalMonthly && goalMonthly > 0
                  ? monthly >= goalMonthly
                    ? "Enough to reach your goal on time."
                    : `About ${moneyWhole(goalMonthly - monthly, currency)} a month short of your target date.`
                  : undefined
              }
            />
          ) : null}
        </View>
      ) : null}

      {draft.type === "percent_income" ? (
        <View style={{ gap: space.xs }}>
          <Txt v="labelM" color="textMuted">
            Share of each payday
          </Txt>
          <ChoiceRow
            label="Share of each payday"
            options={PERCENT_OPTIONS.map((p) => ({ value: p, label: `${p}%` }))}
            value={draft.percent}
            onChange={(percent) => onChange({ ...draft, percent })}
          />
        </View>
      ) : null}

      {draft.type !== "none" ? (
        <Txt v="caption" color="textMuted">
          Every auto-save shows in Upcoming 7 days ahead. Skip one or pause them all in one tap.
        </Txt>
      ) : null}
    </View>
  );
}

function Framing({ text, sub }: { text: string; sub?: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.framing, { backgroundColor: c.surface, borderColor: c.border }]}>
      <LightningIcon size={20} color={c.text} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="labelL">{text}</Txt>
        {sub ? (
          <Txt v="caption" color="textMuted">
            {sub}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  cell: { flexBasis: "48%", flexGrow: 1 },
  framing: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
});
