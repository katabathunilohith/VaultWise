import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router, Stack as RouterStack } from "expo-router";
import { Banner, Button, PinPad, PracticeBadge, Txt, useNow } from "@/components/ui";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { haptic } from "@/lib/haptics";
import { setDevicePin } from "@/lib/session";
import { space, useTheme } from "@/theme";
import { StepScreen, useHardwareBack } from "../layout";
import { isWeakPin, PinLayout } from "../pin";
import { draftReady, getDraft } from "./draft";

type Phase = "choose" | "confirm" | "creating" | "failed";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * After a failed create, checks whether the wallet exists anyway. A timeout (status 0) can mean
 * the server is still seeding demo history, so it looks a few more times before giving up.
 */
async function walletExists(e: unknown) {
  const tries = e instanceof ApiError && e.status === 0 ? 4 : 1;
  for (let i = 0; i < tries; i++) {
    if (i) await pause(2500);
    const ok = await api
      .me()
      .then((m) => m.onboarded)
      .catch(() => false);
    if (ok) return true;
  }
  return false;
}

/** Onboarding step 2: choose a PIN, type it again, then create the account on the server. */
export function ChoosePinStep() {
  const [phase, setPhase] = useState<Phase>("choose");
  const [chooseError, setChooseError] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [startedAt, setStartedAt] = useState(0);
  const first = useRef("");
  const pinRef = useRef("");

  // Step 1 must be complete (e.g. after a refresh on web the in-memory draft is gone).
  useEffect(() => {
    if (!draftReady()) router.replace("/onboarding");
  }, []);

  const reject = (message: string) => {
    haptic("pin.wrong");
    setHint(message);
    setChooseError((n) => n + 1);
    setPhase("choose");
  };

  const create = async (pin: string) => {
    pinRef.current = pin;
    setFailure(null);
    setStartedAt(Date.now());
    setPhase("creating");
    const d = getDraft();
    try {
      await api.onboarding({ name: d.name, email: d.email || undefined, country: d.country ?? "", pin, demo: d.demo });
    } catch (e) {
      // With demo history the server can still be finishing when the request times out.
      if (!(await walletExists(e))) {
        haptic("error");
        setFailure(e);
        setPhase("failed");
        return;
      }
    }
    await setDevicePin(pin);
    // The account exists now; the protect step blocks going back (see onboarding/_layout).
    router.replace("/onboarding/protect");
  };

  const onPin = (pin: string) => {
    if (phase === "choose") {
      if (isWeakPin(pin)) return reject("That PIN is easy to guess. Try a less obvious one.");
      first.current = pin;
      setHint(null);
      setPhase("confirm");
      return;
    }
    if (pin !== first.current) return reject("Those PINs didn't match. Choose a PIN again.");
    void create(pin);
  };

  const back = phase === "confirm" ? () => setPhase("choose") : phase === "choose" || phase === "failed" ? () => router.back() : undefined;
  // Android Back: one step back from "Type it again"; nothing while the account is being created.
  useHardwareBack(phase === "creating" ? "block" : phase === "confirm" ? () => setPhase("choose") : null);
  // No swipe back while the account is being created.
  const options = <RouterStack.Screen options={{ gestureEnabled: phase !== "creating" }} />;

  if (phase === "creating")
    return (
      <>
        {options}
        <Creating demo={getDraft().demo} startedAt={startedAt} />
      </>
    );

  if (phase === "failed")
    return (
      <>
        {options}
        <StepScreen back={back} step={{ n: 2, of: 3 }} footer={<Button label="Try again" onPress={() => void create(pinRef.current)} armOnMount />}>
          <Txt v="headline" accessibilityRole="header">
            Your account wasn’t set up
          </Txt>
          <Banner tone="danger" title="Vaultwise didn't finish" body={errorMessage(failure)} />
          <Txt v="bodyM" color="textMuted">
            Your details are still here. Try again, or go back to check them.
          </Txt>
        </StepScreen>
      </>
    );

  return (
    <>
      {options}
      <StepScreen back={back} step={{ n: 2, of: 3 }} scroll={false}>
        <PinLayout
          bottomInset={false}
          title={phase === "choose" ? "Choose a PIN" : "Type it again"}
          body={phase === "choose" ? "4 digits. It unlocks Vaultwise and approves money moves." : "So we know it's the one you meant."}
          status={hint}
          pad={<PinPad key={phase} error={phase === "choose" ? chooseError : 0} onComplete={onPin} />}
        />
      </StepScreen>
    </>
  );
}

/** Calm progress while the server creates the wallet (up to ~15 s with demo history). */
function Creating({ demo, startedAt }: { demo: boolean; startedAt: number }) {
  const { c } = useTheme();
  const now = useNow(1000);
  const s = Math.max(0, (now - startedAt) / 1000);
  const line = demo
    ? s < 3
      ? "Creating your account"
      : s < 7
        ? "Adding sample vaults"
        : s < 12
          ? "Adding four months of practice history"
          : "Almost done"
    : s < 5
      ? "Creating your account"
      : "Almost done";
  return (
    <StepScreen step={{ n: 2, of: 3 }} scroll={false}>
      <View style={styles.center}>
        <ActivityIndicator color={c.accent} size="large" />
        <Txt v="titleL" align="center" accessibilityRole="header" accessibilityLiveRegion="polite">
          {line}
        </Txt>
        <Txt v="bodyM" color="textMuted" align="center">
          {demo ? "With demo history this can take up to 20 seconds. You can leave this screen open." : "This takes a few seconds."}
        </Txt>
        <PracticeBadge />
      </View>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.sm, paddingBottom: space.xxxl },
});
