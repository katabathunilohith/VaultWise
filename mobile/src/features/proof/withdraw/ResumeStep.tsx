import { View } from "react-native";
import { router } from "expo-router";
import { ListChecksIcon } from "@/components/icons";
import { Button, ModalScreen, PracticeBadge, ScreenSkeleton, Txt } from "@/components/ui";
import { resumeTarget, withdrawalRule } from "@/features/vaults/withdrawal-status";
import type { WithdrawalRow } from "@/lib/api/types";
import { space } from "@/theme";
import { TalkToPerson, TextLink } from "../components/Links";
import { amountText } from "../describe";
import type { FlowVault, StepNav } from "./types";

/** Where the flow picks up an existing request: the rule lives with the other withdrawal-status rules. */
export { resumeTarget };

/**
 * Opening the flow for an existing request (`?withdrawalId=`). The flow jumps straight to the
 * right step once the request loads; this covers the moments before that, and requests that
 * are already finished or can't be found.
 */
export function ResumeStep({ nav, vault, row }: { nav: StepNav; vault: FlowVault; row: WithdrawalRow | null }) {
  if (row && resumeTarget(row))
    return (
      <ModalScreen title={`Withdraw · ${vault.name}`} onClose={nav.onClose}>
        <ScreenSkeleton />
      </ModalScreen>
    );
  return (
    <ModalScreen title={`Withdraw · ${vault.name}`} onClose={nav.onClose} footer={<Button label="Done" armOnMount onPress={nav.onClose} />}>
      <PracticeBadge />
      <View style={{ gap: space.xs }}>
        <Txt v="headline" accessibilityRole="header">
          {row ? "Nothing left to do here" : "We can't find this request"}
        </Txt>
        <Txt v="bodyL" color="textMuted">
          {row
            ? `${amountText(row.amount, vault.currency)}${row.payee ? ` to ${row.payee}` : ""}. ${withdrawalRule(row.status).finishedNote ?? "This withdrawal is finished."}`
            : `It isn't in ${vault.name} any more. It may have been cancelled or closed.`}
        </Txt>
      </View>
      {row?.proof_id ? (
        <TextLink label="See every check" icon={ListChecksIcon} onPress={() => router.push({ pathname: "/proof/[id]", params: { id: row.proof_id! } })} />
      ) : null}
      <TalkToPerson />
    </ModalScreen>
  );
}
