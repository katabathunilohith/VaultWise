import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Banner, Button, Card, Divider, ModalScreen, ScreenSkeleton, StatusPill, Txt, useHardwareBack } from "@/components/ui";
import { CalmError } from "@/features/account/controls";
import { whenText } from "@/features/proof/format";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { useApiQuery, useMe } from "@/lib/api/hooks";
import { spokenId } from "@/lib/api/identity-ids";
import type { KycInput, KycView } from "@/lib/api/identity-types";
import { invalidate, qk } from "@/lib/api/keys";
import { usePracticeMode } from "@/lib/api/practice";
import { haptic } from "@/lib/haptics";
import { space, useTheme } from "@/theme";
import { checkIdForm, EMPTY_ID_FORM, IdForm, idSubmission, type IdFormErrors, type IdFormValue } from "./IdForm";
import { describeKyc, idLine } from "./status";
import { ensureAiAnswer } from "@/features/ai-consent"; // ai-consent

const close = () => (router.canGoBack() ? router.back() : router.replace("/settings"));

/** The outcome haptics are the verification ones (DESIGN.md section 4). */
function outcomeHaptic(v: KycView) {
  if (v.status === "verified") haptic("proof.approved");
  else if (v.status === "rejected") haptic("proof.declined");
  else haptic("proof.review");
}

/**
 * Verify your ID (calm core, full-screen modal): where the check is, and the form to send one.
 * The photo and any typed number stay in this screen's memory until they're sent, then go.
 */
export function VerifyIdScreen() {
  const { c } = useTheme();
  const practice = usePracticeMode();
  const qc = useQueryClient();
  const me = useMe();
  const market = me.data?.onboarded ? me.data.user.jurisdiction : null;
  const [latest, setLatest] = useState<KycView | null>(null);
  const q = useApiQuery(qk.kyc(), api.kyc, {
    refetchInterval: (query) => (query.state.data?.status === "needs_review" ? (practice ? 4_000 : 60_000) : false),
  });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<IdFormValue>(EMPTY_ID_FORM);
  const [errors, setErrors] = useState<IdFormErrors>({});
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  // A fresher answer from the server wins over the one the last check returned.
  const current: KycView | undefined = latest && q.data && (q.data.updatedAt ?? 0) >= (latest.updatedAt ?? 0) ? q.data : (latest ?? q.data);
  const canGoBack = editing && !!current && !describeKyc(current).notStarted;
  useHardwareBack(sending ? "block" : canGoBack ? () => setEditing(false) : null);

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
      setLatest(result);
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
      </ModalScreen>
    );

  return <StatusView view={current} practice={practice} onRetry={() => setEditing(true)} />;
}

function StatusView({ view, practice, onRetry }: { view: KycView; practice: boolean; onRetry: () => void }) {
  const { c } = useTheme();
  const copy = describeKyc(view);
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
          {copy.body}
        </Txt>
      </View>
      {view.docType ? (
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
        <Banner tone="info" title="Practice" body="A pretend person approves this about 20 seconds after you sent it. This screen updates by itself." />
      ) : null}
      <Txt v="caption" color="textMuted">
        Vaultwise keeps only the last 4 characters of your ID number, never the whole number.
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
