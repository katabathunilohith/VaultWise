import { useEffect, useState } from "react";
import { Banner, Button, Txt } from "@/components/ui";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { haptic } from "@/lib/haptics";
import { EarlierReview, FailedBanner, PointList, StepFrame, StepIntro, type Note, type StepProps } from "./StepFrame";
import { openDigiLocker } from "./external";
import { clearOpenTry, readOpenTry, saveOpenTry } from "./open-try";
import { isOutOfStep, isProviderDown, isStepWaiting, isTryGone } from "./steps-model";

type Busy = "start" | "visit" | "finish" | null;

/**
 * Step 2: Aadhaar through DigiLocker. Says what Vaultwise gets (name, year of birth, last 4 digits;
 * never the number), opens the provider's DigiLocker page in an in-app browser, and finishes the step
 * when the person is back. If DigiLocker isn't finished, the try stays open: finish again, or reopen it.
 * Practice never opens a browser; DigiLocker "comes back" at once with the sample answer.
 */
export function DigiLockerStep({ frame, step, reasons, practice, onView, onStale }: StepProps) {
  const [open, setOpen] = useState<{ requestId: string; url: string } | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  /** Web: DigiLocker opened in another tab, so the person says when they're done. */
  const [elsewhere, setElsewhere] = useState(false);

  // A try started before the app lock (or the phone) closed this screen.
  useEffect(() => {
    let live = true;
    void readOpenTry("aadhaar", practice).then((t) => {
      if (live && t) setOpen((cur) => cur ?? { requestId: t.requestId, url: t.link });
    });
    return () => {
      live = false;
    };
  }, [practice]);

  const finish = async (requestId: string) => {
    setBusy("finish");
    setNote(null);
    setFailure(null);
    try {
      const view = await api.finishDigiLocker(requestId);
      clearOpenTry();
      setOpen(null);
      onView(view, "aadhaar");
    } catch (e) {
      if (isStepWaiting(e)) {
        haptic("warning");
        setNote({ tone: "warning", title: "DigiLocker isn't finished yet", body: errorMessage(e) });
      } else if (isTryGone(e)) {
        clearOpenTry();
        setOpen(null);
        haptic("warning");
        setNote({ tone: "info", title: "That DigiLocker visit expired", body: "Start again. It takes about a minute." });
      } else {
        haptic("error");
        setFailure(e);
        if (isOutOfStep(e)) onStale();
      }
    } finally {
      setBusy(null);
    }
  };

  const visit = async (t: { requestId: string; url: string }) => {
    if (practice) return finish(t.requestId);
    setBusy("visit");
    setNote(null);
    setFailure(null);
    const outcome = await openDigiLocker(t.url);
    setBusy(null);
    if (outcome === "returned") return finish(t.requestId);
    if (outcome === "elsewhere") return setElsewhere(true);
    haptic("error");
    setNote({ tone: "danger", title: "DigiLocker didn't open", body: "Try again in a moment." });
  };

  const start = async () => {
    setBusy("start");
    setNote(null);
    setFailure(null);
    setElsewhere(false);
    try {
      const t = await api.startDigiLocker();
      const next = { requestId: t.requestId, url: t.url };
      setOpen(next);
      saveOpenTry({ step: "aadhaar", requestId: t.requestId, link: t.url, expiresAt: null, practice });
      setBusy(null);
      await visit(next);
    } catch (e) {
      haptic("error");
      setFailure(e);
      if (isOutOfStep(e)) onStale();
      setBusy(null);
    }
  };

  const footer = open ? (
    <>
      {!practice ? (
        <Button label="Open DigiLocker again" variant="tonal" disabled={!!busy} onPress={() => void visit(open)} />
      ) : null}
      <Button label="I've allowed sharing" onPress={() => void finish(open.requestId)} loading={busy === "finish"} disabled={!!busy} armOnMount />
    </>
  ) : (
    <Button label="Continue to DigiLocker" onPress={() => void start()} loading={!!busy} disabled={!!busy} armOnMount />
  );

  return (
    <StepFrame frame={frame} busy={!!busy} footer={footer}>
      <StepIntro
        title="Connect DigiLocker"
        body="Your Aadhaar comes from DigiLocker, the government's document wallet. You sign in there and allow sharing it with Vaultwise."
      />
      <EarlierReview steps={frame.steps} before="aadhaar" />
      {step.status === "failed" && !note && !failure ? <FailedBanner name="aadhaar" reasons={reasons} /> : null}
      {note ? <Banner tone={note.tone} title={note.title} body={note.body} /> : null}
      {failure ? (
        <Banner tone="danger" title={isProviderDown(failure) ? "DigiLocker is down for now" : "DigiLocker didn't connect"} body={errorMessage(failure)} />
      ) : null}
      {elsewhere ? <Banner tone="info" title="DigiLocker opened in another tab" body="Allow sharing there, then come back and tap I've allowed sharing." /> : null}
      {open && !note && !elsewhere && !practice ? (
        <Txt v="bodyM" color="textMuted">
          Signed in to DigiLocker and allowed sharing? Tap I&apos;ve allowed sharing. Closed it too soon? Open it again.
        </Txt>
      ) : null}
      <PointList
        title="What Vaultwise gets from DigiLocker"
        points={["Your name", "Your year of birth", "The last 4 digits of your Aadhaar"]}
        footnote="Never your full Aadhaar number, your address, your photo or the document itself."
      />
      {practice ? (
        <Txt v="caption" color="textMuted">
          In Practice, DigiLocker doesn&apos;t open. The sample answer comes back straight away: Aadhaar ending 1234.
        </Txt>
      ) : null}
    </StepFrame>
  );
}
