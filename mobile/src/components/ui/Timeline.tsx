import { StyleSheet, View } from "react-native";
import { CheckIcon, CircleNotchIcon, WarningIcon, XIcon } from "@/components/icons";
import { useTheme } from "@/theme";
import { spoken } from "./a11y";
import { Txt } from "./Txt";

export type StepState = "done" | "active" | "pending" | "warn" | "failed" | "skipped";

export interface TimelineStep {
  key: string;
  title: string;
  detail?: string;
  time?: string;
  state: StepState;
}

/**
 * The release tracker. Every money movement shows where it is, why, and what happens next —
 * the single most requested fix across 3,000+ competitor reviews ("money stuck, no reason, no ETA").
 * Plain words only; never model jargon (confidence %, thresholds).
 */
export function Timeline({ steps, color }: { steps: TimelineStep[]; color?: string }) {
  const { c } = useTheme();
  const accent = color ?? c.accent;
  return (
    <View accessibilityRole="list">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const tone =
          s.state === "done" ? accent : s.state === "failed" ? c.danger : s.state === "warn" ? c.warning : s.state === "active" ? accent : c.borderStrong;
        return (
          // One element per step: without `accessible`, iOS skips this label and reads the texts
          // one by one, and the state (shown only by the icon and colour) is never said.
          <View key={s.key} style={styles.row} accessible accessibilityLabel={spoken(s.title, stateWord(s.state), s.time, s.detail)}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.node,
                  {
                    borderColor: tone,
                    backgroundColor: s.state === "done" ? accent : s.state === "failed" ? c.danger : s.state === "warn" ? c.warningFill : c.bg,
                  },
                ]}
              >
                {s.state === "done" ? <CheckIcon size={14} color={c.ink} weight="bold" /> : null}
                {s.state === "failed" ? <XIcon size={14} color={c.ink} weight="bold" /> : null}
                {s.state === "warn" ? <WarningIcon size={13} color={c.onWarning} weight="bold" /> : null}
                {s.state === "active" ? <CircleNotchIcon size={14} color={accent} weight="bold" /> : null}
              </View>
              {!last ? <View style={[styles.line, { backgroundColor: s.state === "done" ? accent : c.border }]} /> : null}
            </View>
            <View style={[styles.body, last && { paddingBottom: 0 }]}>
              <View style={styles.titleRow}>
                <Txt v="labelL" color={s.state === "pending" || s.state === "skipped" ? "textMuted" : "text"} style={{ flex: 1 }}>
                  {s.title}
                </Txt>
                {s.time ? (
                  <Txt v="numS" color="textMuted">
                    {s.time}
                  </Txt>
                ) : null}
              </View>
              {s.detail ? (
                <Txt v="bodyM" color="textMuted">
                  {s.detail}
                </Txt>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function stateWord(s: StepState) {
  return { done: "Done", active: "In progress", pending: "Not started", warn: "Needs attention", failed: "Didn't pass", skipped: "Not needed" }[s];
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 14 },
  rail: { alignItems: "center", width: 24 },
  node: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  line: { width: 2, flex: 1, minHeight: 18, marginVertical: 2 },
  body: { flex: 1, paddingBottom: 18, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
