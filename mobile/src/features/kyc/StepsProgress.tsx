import { StyleSheet, View } from "react-native";
import { CheckIcon, ClockIcon, XIcon } from "@/components/icons";
import { Txt } from "@/components/ui";
import type { KycStepName, KycSteps } from "@/lib/api/identity-types";
import { space, useTheme } from "@/theme";
import { finishedCount, spokenStepNumber, STEP_ORDER, STEP_TITLES, stepNumber } from "./steps-model";

/**
 * kyc-checks: the progress header of the onboarding steps. "Step 2 of 3", a three-part bar, and each
 * step with where it is: done (with its last 4), with a person, didn't pass, now, or still to come.
 * `current` null: all finished (the status screen), so no "Step n of 3".
 */
export function StepsProgress({ steps, current }: { steps: KycSteps; current: KycStepName | null }) {
  const { c } = useTheme();
  const finished = finishedCount(steps);
  const tone = (name: KycStepName) => {
    const s = steps[name].status;
    if (s === "done") return c.accent;
    if (s === "review") return c.warning;
    if (s === "failed") return c.danger;
    return name === current ? c.borderStrong : c.border;
  };
  return (
    <View style={{ gap: space.sm }}>
      {current ? (
        <Txt v="labelM" color="textMuted">
          Step {STEP_ORDER.indexOf(current) + 1} of 3
        </Txt>
      ) : null}
      <View
        style={styles.bar}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${finished} of 3 steps finished`}
        accessibilityValue={{ min: 0, max: 3, now: finished }}
      >
        {STEP_ORDER.map((name) => (
          <View key={name} style={[styles.segment, { backgroundColor: tone(name) }]} />
        ))}
      </View>
      <View accessibilityRole="list" style={{ gap: space.xxs }}>
        {STEP_ORDER.map((name, i) => (
          <StepRow key={name} name={name} index={i + 1} steps={steps} current={name === current} />
        ))}
      </View>
    </View>
  );
}

function StepRow({ name, index, steps, current }: { name: KycStepName; index: number; steps: KycSteps; current: boolean }) {
  const { c } = useTheme();
  const { status, last4 } = steps[name];
  const number = status === "done" ? stepNumber(name, last4) : "";
  const detail =
    status === "done"
      ? number || "Done"
      : status === "review"
        ? "A person will check"
        : status === "failed"
          ? "Didn't pass. Try again"
          : current
            ? "Now"
            : "";
  const said =
    status === "done"
      ? ["Done", spokenStepNumber(last4)].filter(Boolean).join(", ")
      : status === "review"
        ? "A person will check it"
        : status === "failed"
          ? "Didn't pass. Try it again"
          : current
            ? "To do now"
            : "Still to do";
  const node =
    status === "done"
      ? { border: c.accent, fill: c.accent }
      : status === "review"
        ? { border: c.warning, fill: c.warningFill }
        : status === "failed"
          ? { border: c.danger, fill: c.danger }
          : { border: current ? c.accent : c.borderStrong, fill: c.bg };
  return (
    <View style={styles.row} accessible accessibilityLabel={`Step ${index}, ${STEP_TITLES[name]}. ${said}.`}>
      <View style={[styles.node, { borderColor: node.border, backgroundColor: node.fill }]}>
        {status === "done" ? <CheckIcon size={14} color={c.ink} weight="bold" /> : null}
        {status === "review" ? <ClockIcon size={14} color={c.onWarning} weight="bold" /> : null}
        {status === "failed" ? <XIcon size={14} color={c.ink} weight="bold" /> : null}
        {status === "todo" ? (
          <Txt v="micro" color={current ? "accent" : "textMuted"}>
            {index}
          </Txt>
        ) : null}
      </View>
      <Txt v="labelL" color={status === "todo" && !current ? "textMuted" : "text"} style={{ flex: 1 }}>
        {STEP_TITLES[name]}
      </Txt>
      {detail ? (
        <Txt v={number ? "numS" : "bodyM"} color="textMuted">
          {detail}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", gap: 6 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40 },
  node: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
