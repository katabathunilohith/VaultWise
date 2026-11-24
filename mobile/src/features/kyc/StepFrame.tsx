import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Banner, Button, ModalScreen, Txt, useHardwareBack, type Tone } from "@/components/ui";
import type { KycStep, KycStepName, KycSteps, KycView } from "@/lib/api/identity-types";
import { radius, space, useTheme } from "@/theme";
import { closeVerifyId } from "./routes";
import { StepsProgress } from "./StepsProgress";
import { STEP_ORDER, STEP_TITLES } from "./steps-model";

/** What every step's screen shares: the steps for the header, Back, and Practice's switch to the photo check. */
export interface FrameProps {
  steps: KycSteps;
  current: KycStepName | null;
  /** Back to the status screen (after "Try again"), instead of Close. */
  back?: () => void;
  /** Practice only: show the photo check instead of the steps. */
  onPracticePhoto?: () => void;
  /** Practice only: a verified person is running the steps again. */
  practiceRestart?: boolean;
}

/** What a step's panel gets from the flow. */
export interface StepProps {
  frame: FrameProps;
  step: KycStep;
  /** The check's plain-words reasons (steps that are with a person or didn't pass). */
  reasons: string[];
  practice: boolean;
  /** A step answered with a new view. */
  onView: (view: KycView, step: KycStepName) => void;
  /** A call failed because the check moved on elsewhere (isOutOfStep): fetch the view again. */
  onStale: () => void;
}

/** A short message on a step: the try isn't finished, it expired, the browser didn't open. */
export interface Note {
  tone: Tone;
  title: string;
  body?: string;
}

/**
 * One step's screen (calm core, full-screen modal): the progress header, the step, and its main
 * button in the footer. While a step is busy, Close and Back are hidden and hardware back waits.
 */
export function StepFrame({ frame, footer, busy, children }: { frame: FrameProps; footer: ReactNode; busy: boolean; children: ReactNode }) {
  useHardwareBack(busy ? "block" : (frame.back ?? null));
  return (
    <ModalScreen title="Verify your ID" onClose={closeVerifyId} back={frame.back} hideLeading={busy} footer={footer}>
      <StepsProgress steps={frame.steps} current={frame.current} />
      {frame.practiceRestart ? (
        <Banner tone="info" title="Practice" body="Checking your PAN starts the steps again. Practice money can't move until all three are done." />
      ) : null}
      {children}
      {frame.onPracticePhoto ? (
        <Button
          label="Practice the photo check instead"
          variant="ghost"
          size="sm"
          disabled={busy}
          onPress={frame.onPracticePhoto}
          accessibilityHint="Practice only. Shows the check with a photo of an ID."
          style={{ alignSelf: "flex-start" }}
        />
      ) : null}
    </ModalScreen>
  );
}

/** The step's headline and one or two lines under it. */
export function StepIntro({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <Txt v="headline" accessibilityRole="header">
        {title}
      </Txt>
      <Txt v="bodyM" color="textMuted">
        {body}
      </Txt>
    </View>
  );
}

/** A short list under a label, e.g. what Vaultwise gets from DigiLocker. */
export function PointList({ title, points, footnote }: { title: string; points: string[]; footnote?: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Txt v="labelM" accessibilityRole="header">
        {title}
      </Txt>
      {points.map((p) => (
        <View key={p} style={styles.point}>
          <View style={[styles.dot, { backgroundColor: c.textMuted }]} />
          <Txt v="bodyM" style={{ flex: 1 }}>
            {p}
          </Txt>
        </View>
      ))}
      {footnote ? (
        <Txt v="caption" color="textMuted">
          {footnote}
        </Txt>
      ) : null}
    </View>
  );
}

/** "A person will check your PAN": earlier steps with a person don't stop the next one. */
export function EarlierReview({ steps, before }: { steps: KycSteps; before: KycStepName }) {
  const names = STEP_ORDER.slice(0, STEP_ORDER.indexOf(before)).filter((n) => steps[n].status === "review");
  if (!names.length) return null;
  const what = names.map((n) => (n === "pan" ? "PAN" : n === "aadhaar" ? "Aadhaar" : "bank account")).join(" and ");
  return <Banner tone="info" title={`A person will check your ${what}`} body="Carry on meanwhile. They look once all three steps are done, usually within a day." />;
}

/** A step that didn't pass: why, and that it can be tried again. */
export function FailedBanner({ name, reasons }: { name: KycStepName; reasons: string[] }) {
  return <Banner tone="danger" title={`${STEP_TITLES[name]} didn't pass`} body={reasons.length ? reasons.join(" ") : "Try this step again."} />;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.xs },
  point: { flexDirection: "row", gap: space.xs, alignItems: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
});
