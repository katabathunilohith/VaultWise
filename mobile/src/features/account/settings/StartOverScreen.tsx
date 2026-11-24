import { useState } from "react";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Banner, Button, Txt } from "@/components/ui";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { haptic } from "@/lib/haptics";
import { Page } from "../layout";

/**
 * Practice only: puts back the sample account. Practice data is saved on the phone
 * (lib/api/demo/persist.ts), so this is the way to get a clean start without deleting the account.
 */
export function StartOverScreen() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);

  const startOver = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await api.reset();
      // Every cached answer came from the old Practice data.
      await qc.resetQueries();
      router.dismissTo("/");
    } catch (e) {
      haptic("error");
      setProblem(e);
      setBusy(false);
    }
  };

  return (
    <Page title="Start Practice over" footer={<Button label="Start over" variant="dangerOutline" loading={busy} onPress={() => void startOver()} />}>
      <Txt v="bodyM">
        This puts back the sample account and its pretend money. The vaults, withdrawals, wallet moves and payments you made in Practice are cleared.
      </Txt>
      <Txt v="bodyM" color="textMuted">
        Your PIN, app lock and settings stay as they are.
      </Txt>
      {problem ? <Banner tone="warning" title="That didn't work" body={errorMessage(problem)} /> : null}
    </Page>
  );
}
