import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router, type Href } from "expo-router";
import { ModalScreen, PracticeBadge, useHardwareBack } from "@/components/ui";
import { useTheme } from "@/theme";
import { settleMpinAsk, takeMpinAsk, type MpinAsk, type MpinOutcome, type MpinRun } from "./ask";
import { RESET_MPIN_ROUTE, TRUST_PHONE_ROUTE } from "./config"; // devices
import { readDeviceError, readMpinError } from "./errors";
import { MpinPanel } from "./MpinPanel";

/**
 * The MPIN sheet (full-screen modal, R7: PIN entry), opened by ensureMpin() / withMpin() just before
 * a money move. Closing it sends nothing. The waiting flow carries on only after the sheet has gone,
 * so it can't pop the wrong screen.
 *
 * While the money move is with the server the sheet never answers "cancelled": if it goes meanwhile
 * (the app locked, say), the flow gets the move's real result when it ends, and the sheet doesn't
 * navigate once it's gone. Otherwise a flow told "nothing was sent" could send the move again.
 */
export function MpinSheet() {
  const { c } = useTheme();
  const [ask] = useState<MpinAsk | null>(takeMpinAsk);
  /** What the flow hears when the sheet goes: the move's result once it has one, otherwise "cancelled". */
  const outcome = useRef<MpinOutcome>({ kind: "cancel" });
  const [busy, setBusy] = useState(false);
  /** The money move is with the server. */
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const settle = useCallback((o: MpinOutcome) => settleMpinAsk(ask, o), [ask]);

  const close = useCallback(() => {
    // Gone already: never navigate from here (it would pop whatever screen is on top now).
    if (!mounted.current) {
      if (!inFlight.current) settle(outcome.current);
      return;
    }
    if (router.canGoBack()) router.back();
    else settle(outcome.current);
  }, [settle]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // A move still with the server answers the flow itself when it ends (see `run`).
      if (!inFlight.current) settle(outcome.current);
    };
  }, [settle]);
  // Opened with nothing waiting (a reload on the web): nothing to approve.
  useEffect(() => {
    if (!ask) close();
  }, [ask, close]);
  // Android Back cancels, except while the MPIN is with the server.
  useHardwareBack(busy ? "block" : close);

  /** The flow's call, recording its result as it lands, so the sheet going early can't lose it. */
  const run = useMemo<MpinRun | null>(() => {
    const call = ask?.run;
    if (!call) return null;
    return async (pin) => {
      inFlight.current = true;
      try {
        const value = await call(pin);
        outcome.current = { kind: "done", pin, value };
        return value;
      } catch (e) {
        // A wrong MPIN, a lock or an untrusted phone moved nothing: the sheet asks again (or, if it's
        // gone, the move counts as cancelled). Anything else goes to the flow.
        if (!readMpinError(e) && !readDeviceError(e)) outcome.current = { kind: "error", error: e };
        throw e;
      } finally {
        inFlight.current = false;
        if (!mounted.current) settle(outcome.current);
      }
    };
  }, [ask, settle]);

  const done = useCallback(
    (pin: string, value: unknown) => {
      outcome.current = { kind: "done", pin, value };
      close();
    },
    [close],
  );
  // devices: Trust this phone or Forgot your MPIN. The money move counts as cancelled; the sheet
  // closes first, then the flow opens over the screen the person was on. Never while the MPIN is
  // with the server (the buttons are off then too).
  const leaveFor = useCallback(
    (route: string) => {
      if (inFlight.current) return;
      outcome.current = { kind: "cancel" };
      close();
      router.push(route as Href);
    },
    [close],
  );

  const failed = useCallback(
    (error: unknown) => {
      outcome.current = { kind: "error", error };
      close();
    },
    [close],
  );

  if (!ask) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  return (
    <ModalScreen onClose={close} hideLeading={busy} scroll={false} headerRight={<PracticeBadge compact />}>
      <MpinPanel
        reason={ask.reason}
        run={run}
        onDone={done}
        onError={failed}
        onBusy={setBusy}
        onTrustPhone={() => leaveFor(TRUST_PHONE_ROUTE)} // devices
        onResetMpin={() => leaveFor(RESET_MPIN_ROUTE)} // devices
      />
    </ModalScreen>
  );
}
