import { useState } from "react";
import { AccessibilityInfo, ActivityIndicator, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Banner, Button, Card, Divider, ModalScreen, ScreenSkeleton, StatusPill, Txt, useHardwareBack } from "@/components/ui";
import { CalmError } from "@/features/account/controls";
import { whenText } from "@/features/proof/format";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { useApiQuery, useMe } from "@/lib/api/hooks";
import { spokenId } from "@/lib/api/identity-ids";
import type { KycInput, KycStepName, KycView } from "@/lib/api/identity-types";
import { invalidate, qk } from "@/lib/api/keys";
import { usePracticeMode } from "@/lib/api/practice";
import { haptic } from "@/lib/haptics";
import { space, useTheme } from "@/theme";
import { checkIdForm, EMPTY_ID_FORM, IdForm, idSubmission, type IdFormErrors, type IdFormValue } from "./IdForm";
import { closeVerifyId as close } from "./routes";
import { describeKyc, idLine } from "./status";
import { StepsFlow } from "./StepsFlow";
import { StepsProgress } from "./StepsProgress";
import { anyStepStarted, currentStep, STEP_TITLES } from "./steps-model";
import { ensureAiAnswer } from "@/features/ai-consent"; // ai-consent

/** The outcome haptics are the verification ones (DESIGN.md section 4). */
function outcomeHaptic(v: KycView) {
  if (v.status === "verified") haptic("proof.approved");
  else if (v.status === "rejected") haptic("proof.declined");
  else haptic("proof.review");
}

/** kyc-checks: what a screen reader hears when a step answers (the haptic says it to everyone else). */
function stepAnnouncement(v: KycView, step: KycStepName) {
  if (v.status === "verified") return "All three steps are done. Your ID is verified.";
  if (v.status === "needs_review") return "All three steps are done. A person is checking your ID.";
  if (!v.steps) return "";
  const status = v.steps[step].status;
  const next = currentStep(v.steps);
  const then = next ? ` Next: ${STEP_TITLES[next]}.` : "";
  if (status === "done") return `${STEP_TITLES[step]} done.${then}`;
  if (status === "review") return `A person will check your ${STEP_TITLES[step]}. Carry on meanwhile.${then}`;
  return `${STEP_TITLES[step]} didn't pass. Try again.`;
}

/**
 * Verify your ID (calm core, full-screen modal): where the check is, and how to do it. The server
 * says which way this account verifies: a photo of an ID (the form here), or the onboarding steps
 * (StepsFlow: PAN, DigiLocker, bank account). The photo and any typed number stay in this screen's
 * memory until they're sent, then go.
 */
export function VerifyIdScreen() {
  const { c } = useTheme();
  const practice = usePracticeMode();
  const qc = useQueryClient();
  const me = useMe();
  const market = me.data?.onboarded ? me.data.user.jurisdiction : null;
  const [latest, setLatest] = useState<{ view: KycView; at: number } | null>(null);
  const q = useApiQuery(qk.kyc(), api.kyc, {
    refetchInterval: (query) => (query.state.data?.status === "needs_review" ? (practice ? 4_000 : 60_000) : false),
  });
  const [editing, setEditing] = useState(false);
  /** kyc-checks, Practice only: show the photo check although Practice verifies with the steps. */
  const [practicePhoto, setPracticePhoto] = useState(false);
  const [form, setForm] = useState<IdFormValue>(EMPTY_ID_FORM);
  const [errors, setErrors] = useState<IdFormErrors>({});
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  // The last answer a check returned, until the server is asked again after it.
  const current: KycView | undefined = latest && latest.at > q.dataUpdatedAt ? latest.view : (q.data ?? latest?.view);
  const stepsFlow = current?.flow === "steps" && !(practice && practicePhoto);
  const canGoBack = editing && !!current && !describeKyc(current).notStarted;
  // The steps handle hardware back themselves (StepFrame), so they can hold it while a step is busy.
  useHardwareBack(stepsFlow ? null : sending ? "block" : canGoBack ? () => setEditing(false) : null);

  /** kyc-checks: a step answered. The flow moves on by itself; once all three are finished, the outcome shows. */
  const onStepView = (v: KycView, step: KycStepName) => {
    setLatest({ view: v, at: Date.now() });
    void invalidate(qc, "kyc", "me");
    const said = stepAnnouncement(v, step);
    if (said) AccessibilityInfo.announceForAccessibility(said);
    if (v.status === "verified" || v.status === "needs_review") {
      setEditing(false);
      outcomeHaptic(v);
      return;
    }
    const status = v.steps?.[step].status;
    if (status === "done") haptic("proof.approved");
    else if (status === "review") haptic("proof.review");
    else if (status === "failed") haptic("proof.declined");
  };

  const submit = async () => {
    const e = checkIdForm(form, { photo: "required", market });
    setErrors(e);
    if (Object.keys(e).length) {
      haptic("error");
      return;
    }
    // ai-consent: ask once whether an AI may read the ID; closing the question sends nothing.
    if (!(await ensureAiAnswer())) return;
    setFailure(null);
    setSending(true);
    try {
      const result = await api.submitKyc(idSubmission(form) as KycInput);
      setForm(EMPTY_ID_FORM);
      setLatest({ view: result, at: Date.now() });
      setEditing(false);
      outcomeHaptic(result);
      void invalidate(qc, "kyc", "me");
    } catch (err) {
      haptic("error");
      setFailure(err);
    } finally {
      setSending(false);
    }
  };

  if (sending)
    return (
      <ModalScreen hideLeading scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.accent} />
          <Txt v="titleL" align="center" accessibilityRole="header" accessibilityLiveRegion="polite">
            Checking your ID
          </Txt>
          <Txt v="bodyM" color="textMuted" align="center">
            This takes a few seconds. Keep this screen open.
          </Txt>
        </View>
      </ModalScreen>
    );

  if (!current && q.isPending)
    return (
      <ModalScreen title="Identity verification" onClose={close}>
        <ScreenSkeleton />
      </ModalScreen>
    );
  if (!current)
    return (
      <ModalScreen title="Identity verification" onClose={close}>
        <CalmError error={q.error} onRetry={() => void q.refetch()} title="Your ID check didn't load" />
      </ModalScreen>
    );

  const copy = describeKyc(current);
  // kyc-checks: the steps, until all three are finished and the server has decided.
  if (stepsFlow && (editing || copy.notStarted))
    return (
      <StepsFlow
        view={current}
        restart={editing && current.status === "verified"}
        practice={practice}
        back={editing && !copy.notStarted ? () => setEditing(false) : undefined}
        onView={onStepView}
        onPracticePhoto={() => setPracticePhoto(true)}
        onRefresh={() => void q.refetch()}
      />
    );
  if (editing || copy.notStarted)
    return (
      <ModalScreen
        title="Verify your ID"
        onClose={close}
        back={editing && !copy.notStarted ? () => setEditing(false) : undefined}
        footer={<Button label="Check my ID" onPress={() => void submit()} armOnMount />}
      >
        <View style={{ gap: space.xs }}>
          <Txt v="headline" accessibilityRole="header">
            Show us your ID
          </Txt>
          <Txt v="bodyM" color="textMuted">
            Vaultwise checks who you are before money can move. It takes about a minute.
          </Txt>
        </View>
        {failure ? <Banner tone="danger" title="Your ID wasn't checked" body={errorMessage(failure)} /> : null}
        <IdForm
          value={form}
          onChange={(next, changed) => {
            setForm(next);
            if (errors[changed as keyof IdFormErrors]) setErrors((x) => ({ ...x, [changed]: undefined }));
          }}
          errors={errors}
          market={market}
          photo="required"
          practice={practice}
        />
        {practice ? (
          <Txt v="caption" color="textMuted">
            In Practice the sample ID passes at once. Any other photo goes to a pretend person, who approves it about 20 seconds later.
          </Txt>
        ) : null}
        {practice && current.flow === "steps" ? (
          <Button label="Practice the steps instead" variant="ghost" size="sm" onPress={() => setPracticePhoto(false)} style={{ alignSelf: "flex-start" }} />
        ) : null}
      </ModalScreen>
    );

  return <StatusView view={current} practice={practice} onRetry={() => setEditing(true)} />;
}

function StatusView({ view, practice, onRetry }: { view: KycView; practice: boolean; onRetry: () => void }) {
  const { c } = useTheme();
  const copy = describeKyc(view);
  // kyc-checks: checked with the steps, so show them (with their last 4s) rather than one ID.
  const showSteps = view.flow === "steps" && !!view.steps && anyStepStarted(view.steps);
  const footer =
    view.status === "rejected" ? (
      <>
        <Button label="Talk to a person" variant="tonal" onPress={() => router.push("/support")} />
        <Button label="Try again" onPress={onRetry} armOnMount />
      </>
    ) : view.status === "verified" ? (
      <>
        {practice ? <Button label="Practice the check again" variant="ghost" size="md" onPress={onRetry} /> : null}
        <Button label="Done" onPress={close} armOnMount />
      </>
    ) : (
      <>
        <Button label="Talk to a person" variant="tonal" onPress={() => router.push("/support")} />
        <Button label="Done" onPress={close} armOnMount />
      </>
    );
  return (
    <ModalScreen title="Identity verification" onClose={close} footer={footer}>
      <View style={{ gap: space.xs }}>
        <StatusPill tone={copy.pill.tone} label={copy.pill.label} />
        <Txt v="headline" accessibilityRole="header">
          {copy.title}
        </Txt>
        <Txt v="bodyL" color="textMuted">
          {/* kyc-checks: a rejection starts the steps again, so no photo to retake. */}
          {view.flow === "steps" && view.status === "rejected" ? "See why, then go through the three steps again." : copy.body}
        </Txt>
      </View>
      {showSteps && view.steps ? (
        <Card>
          <StepsProgress steps={view.steps} current={currentStep(view.steps)} />
          {view.updatedAt ? (
            <>
              <Divider />
              <View style={styles.line}>
                <Txt v="bodyM" color="textMuted">
                  {view.status === "verified" ? "Verified" : "Last step"}
                </Txt>
                <Txt v="bodyM">{whenText(view.updatedAt)}</Txt>
              </View>
            </>
          ) : null}
        </Card>
      ) : view.docType ? (
        <Card>
          <View style={styles.line} accessible accessibilityLabel={`ID: ${spokenId(view.docType, view.idLast4)}`}>
            <Txt v="bodyM" color="textMuted">
              ID
            </Txt>
            <Txt v="numM">{idLine(view.docType, view.idLast4)}</Txt>
          </View>
          {view.updatedAt ? (
            <>
              <Divider />
              <View style={styles.line}>
                <Txt v="bodyM" color="textMuted">
                  {view.status === "verified" ? "Verified" : "Sent"}
                </Txt>
                <Txt v="bodyM">{whenText(view.updatedAt)}</Txt>
              </View>
            </>
          ) : null}
        </Card>
      ) : null}
      {view.reasons.length ? (
        <View style={{ gap: space.xs }}>
          <Txt v="labelM" accessibilityRole="header">
            {view.status === "rejected" ? "Why" : "Why a person is checking"}
          </Txt>
          {view.reasons.map((r) => (
            <View key={r} style={styles.reason}>
              <View style={[styles.dot, { backgroundColor: c.textMuted }]} />
              <Txt v="bodyM" style={{ flex: 1 }}>
                {r}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}
      {practice && view.status === "needs_review" ? (
        <Banner
          tone="info"
          title="Practice"
          body={`A pretend person approves this about 20 seconds after you ${showSteps ? "finished the steps" : "sent it"}. This screen updates by itself.`}
        />
      ) : null}
      <Txt v="caption" color="textMuted">
        {showSteps
          ? "Vaultwise keeps only the last 4 characters of your PAN, Aadhaar and bank account, never the whole numbers."
          : "Vaultwise keeps only the last 4 characters of your ID number, never the whole number."}
      </Txt>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.sm, paddingBottom: space.xxxl },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm, minHeight: 32 },
  reason: { flexDirection: "row", gap: space.xs, alignItems: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
});
