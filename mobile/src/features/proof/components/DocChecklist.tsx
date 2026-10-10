import { StyleSheet, View } from "react-native";
import { CheckCircleIcon } from "@/components/icons";
import { Txt } from "@/components/ui";
import { categoryOf } from "@/lib/categories";
import { useTheme } from "@/theme";
import { CircleIcon } from "../icons";

export interface ChecklistItem {
  key: string;
  label: string;
  detail?: string;
}

/** What this vault's proof needs (answers after-the-fact denials: show the rules before capture). */
export function proofChecklist(opts: { category: string; amountText: string; maxDocAgeDays: number }): { hint: string; items: ChecklistItem[] } {
  const meta = categoryOf(opts.category);
  return {
    hint: meta.proofHint,
    items: [
      { key: "issuer", label: "Who it's from", detail: "The hospital, school, landlord or shop's name" },
      { key: "date", label: `Dated in the last ${opts.maxDocAgeDays} days` },
      { key: "total", label: `A total of at least ${opts.amountText}` },
      { key: "name", label: "Your name or a dependant's" },
      { key: "items", label: "Itemised lines", detail: "What was bought, taught or treated" },
    ],
  };
}

/**
 * The checklist. `ticked` (0…n) marks items as looked over, for the review step's progressive
 * ticks; leave it undefined for a plain list.
 */
export function DocChecklist({ items, ticked, color, onPaper }: { items: ChecklistItem[]; ticked?: number; color?: string; onPaper?: { ink: string; muted: string } }) {
  const { c } = useTheme();
  const ink = onPaper?.ink ?? c.text;
  const muted = onPaper?.muted ?? c.textMuted;
  const tickColor = color ?? c.success;
  return (
    <View style={styles.list} accessibilityRole="list">
      {items.map((it, i) => {
        const done = ticked !== undefined && i < ticked;
        const label = `${it.label}${it.detail ? `. ${it.detail}` : ""}${ticked !== undefined ? (done ? ". Looks there" : ". Not checked yet") : ""}`;
        return (
          <View key={it.key} style={styles.item} accessible accessibilityLabel={label}>
            {ticked === undefined ? (
              <View style={[styles.bullet, { backgroundColor: muted }]} />
            ) : done ? (
              <CheckCircleIcon size={22} color={tickColor} weight="fill" />
            ) : (
              <CircleIcon size={22} color={muted} />
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="labelM" color={ink}>
                {it.label}
              </Txt>
              {it.detail ? (
                <Txt v="caption" color={muted}>
                  {it.detail}
                </Txt>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  item: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8, marginHorizontal: 8 },
});
