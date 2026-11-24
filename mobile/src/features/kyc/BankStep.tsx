import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Banner, Button, Txt, useNow } from "@/components/ui";
import { clockTime } from "@/features/proof/format";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { haptic } from "@/lib/haptics";
import { radius, space, useTheme } from "@/theme";
import { EarlierReview, FailedBanner, PointList, StepFrame, StepIntro, type Note, type StepProps } from "./StepFrame";
import { openUpiLink } from "./external";
import { clearOpenTry, readOpenTry, saveOpenTry } from "./open-try";
import { isOutOfStep, isProviderDown, isStepWaiting, isTryGone } from "./steps-model";

type Busy = "start" | "pay" | "finish" | null;
interface Payment {
  requestId: string;
  upiLink: string;
  expiresAt: number | null;
}

/**
 * Step 3: the bank account, by reverse penny drop. The person pays ₹1 from their UPI app (it's
 * refunded); the payment itself shows the account is theirs. The link opens their UPI app, or is
 * shown when there's none. "I've paid" finishes the step; a payment that hasn't arrived keeps the try
 * open. Practice never opens a UPI app and nothing is paid.
 */
export function BankStep({ frame, step, reasons, practice, onView, onStale }: StepProps) {
  const { c } = useTheme();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [noApp, setNoApp] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const now = useNow(15_000, !!payment?.expiresAt);
  const expired = !!payment?.expiresAt && now >= payment.expiresAt;

  // A payment started before the UPI app trip (and the app lock) closed this screen.
  useEffect(() => {
    let live = true;
    void readOpenTry("bank", practice).then((t) => {
      if (live && t) setPayment((cur) => cur ?? { requestId: t.requestId, upiLink: t.link, expiresAt: t.expiresAt });
    });
    return () => {
      live = false;
    };
  }, [practice]);

  const pay = async (p: Payment) => {
    if (practice) return;
    setBusy("pay");
    const outcome = await openUpiLink(p.upiLink);
    setBusy(null);
    setNoApp(outcome === "no_app");
    if (outcome === "no_app") haptic("warning");
  };

  const start = async () => {
    setBusy("start");
    setNote(null);
    setFailure(null);
    setNoApp(false);
    try {
      const t = await api.startBankCheck();
      const next: Payment = { requestId: t.requestId, upiLink: t.upiLink, expiresAt: t.expiresAt };
      setPayment(next);
      saveOpenTry({ step: "bank", requestId: t.requestId, link: t.upiLink, expiresAt: t.expiresAt, practice });
      setBusy(null);
      await pay(next);
    } catch (e) {
      haptic("error");
      setFailure(e);
      if (isOutOfStep(e)) onStale();
      setBusy(null);
    }
  };

  const finish = async (requestId: string) => {
    setBusy("finish");
    setNote(null);
    setFailure(null);
    try {
      const view = await api.finishBankCheck(requestId);
      clearOpenTry();
      setPayment(null);
      onView(view, "bank");
    } catch (e) {
      if (isStepWaiting(e)) {
        haptic("warning");
        setNote({ tone: "warning", title: "Your ₹1 hasn't arrived yet", body: errorMessage(e) });
      } else if (isTryGone(e)) {
        clearOpenTry();
        setPayment(null);
        haptic("warning");
        setNote({ tone: "info", title: "That payment link expired", body: "Start again with a new link. Anything you paid comes back." });
      } else {
        haptic("error");
        setFailure(e);
        if (isOutOfStep(e)) onStale();
      }
    } finally {
      setBusy(null);
    }
  };

  const waiting = !!payment && !expired;
  const footer = waiting ? (
    <>
      {!practice ? <Button label="Open UPI app again" variant="tonal" disabled={!!busy} onPress={() => void pay(payment)} /> : null}
      <Button label="I've paid" onPress={() => void finish(payment.requestId)} loading={busy === "finish"} disabled={!!busy} armOnMount />
    </>
  ) : (
    <Button label="Pay ₹1 with UPI" onPress={() => void start()} loading={!!busy} disabled={!!busy} armOnMount />
  );

  return (
    <StepFrame frame={frame} busy={!!busy} footer={footer}>
      {waiting ? (
        <StepIntro
          title="Pay ₹1 in your UPI app"
          body={`Then come back and tap I've paid. The ₹1 is refunded to the same account.${payment.expiresAt ? ` The link works until ${clockTime(payment.expiresAt)}.` : ""}`}
        />
      ) : (
        <StepIntro title="Link your bank account" body="Pay ₹1 from your UPI app to prove the account is yours; it's refunded." />
      )}
      <EarlierReview steps={frame.steps} before="bank" />
      {step.status === "failed" && !waiting && !note && !failure ? <FailedBanner name="bank" reasons={reasons} /> : null}
      {expired && !note ? <Banner tone="info" title="That payment link expired" body="Start again with a new link. Anything you paid comes back." /> : null}
      {note ? <Banner tone={note.tone} title={note.title} body={note.body} /> : null}
      {failure ? (
        <Banner tone="danger" title={isProviderDown(failure) ? "Bank checks are down for now" : "That didn't go through"} body={errorMessage(failure)} />
      ) : null}
      {waiting && noApp && !practice ? (
        <View style={{ gap: space.xs }}>
          <Banner tone="warning" title="No UPI app opened" body="Paste this link into a UPI app, or open Vaultwise on a phone that has one." />
          <View style={[styles.link, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Txt v="numS" selectable accessibilityLabel="The UPI payment link. Press and hold to copy it.">
              {payment.upiLink}
            </Txt>
          </View>
        </View>
      ) : null}
      {!waiting ? (
        <PointList
          title="What Vaultwise keeps"
          points={["Your bank's IFSC", "The last 4 digits of the account", "The name on the account"]}
          footnote="Never your full account number. Nothing else is taken from the account."
        />
      ) : null}
      {practice ? (
        <Txt v="caption" color="textMuted">
          {`In Practice nothing is paid and no UPI app opens.${waiting ? " Tap I've paid to carry on." : ""} The sample account is HDFC0000001, ending 4321.`}
        </Txt>
      ) : null}
    </StepFrame>
  );
}

const styles = StyleSheet.create({
  link: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.sm },
});
