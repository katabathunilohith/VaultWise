import { useState } from "react";
import { View } from "react-native";
import { Banner, Button, Txt } from "@/components/ui";
import { TextField } from "@/features/account/onboarding/TextField";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { haptic } from "@/lib/haptics";
import { space } from "@/theme";
import { FailedBanner, StepFrame, StepIntro, type StepProps } from "./StepFrame";
import { checkPan, isOutOfStep, isProviderDown, PRACTICE_PAN, PRACTICE_PAN_MISMATCH } from "./steps-model";

/**
 * Step 1: the PAN. Its format is checked here with the server's rule, then it's sent once and the
 * field is cleared. The answer is done, with a person (the name didn't match), or didn't pass.
 */
export function PanStep({ frame, step, reasons, practice, onView, onStale }: StepProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const submit = async () => {
    if (busy) return;
    const check = checkPan(value);
    if (!check.ok) {
      setError(check.reason);
      haptic("error");
      return;
    }
    setFailure(null);
    setBusy(true);
    try {
      const view = await api.submitPan(check.pan);
      setValue("");
      onView(view, "pan");
    } catch (e) {
      haptic("error");
      setFailure(e);
      if (isOutOfStep(e)) onStale();
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepFrame frame={frame} busy={busy} footer={<Button label="Check my PAN" onPress={() => void submit()} loading={busy} disabled={busy} armOnMount />}>
      <StepIntro
        title="Check your PAN"
        body="We match the name on your PAN with the name on your account. Vaultwise keeps only its last 4 characters."
      />
      {step.status === "failed" && !failure ? <FailedBanner name="pan" reasons={reasons} /> : null}
      {failure ? (
        <Banner tone="danger" title={isProviderDown(failure) ? "PAN checks are down for now" : "Your PAN wasn't checked"} body={errorMessage(failure)} />
      ) : null}
      <TextField
        label="PAN"
        value={value}
        onChangeText={(t) => {
          setValue(t);
          if (error) setError(null);
        }}
        placeholder="ABCDE1234F"
        hint="10 characters: 5 letters, 4 digits, then a letter."
        error={error}
        autoCapitalize="characters"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        importantForAutofill="no"
        textContentType="none"
        maxLength={12}
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        editable={!busy}
      />
      {practice ? (
        <View style={{ gap: space.xxs }}>
          <Button
            label="Use the sample PAN"
            variant="ghost"
            size="md"
            disabled={busy}
            accessibilityHint="Fills in a sample PAN. Practice only."
            onPress={() => {
              setValue(PRACTICE_PAN);
              setError(null);
            }}
            style={{ alignSelf: "flex-start" }}
          />
          <Txt v="caption" color="textMuted">
            In Practice, {PRACTICE_PAN} passes. {PRACTICE_PAN_MISMATCH} has another name on it, so a pretend person checks it. Any other PAN isn&apos;t
            found.
          </Txt>
        </View>
      ) : null}
    </StepFrame>
  );
}
