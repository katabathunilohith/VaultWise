import { View } from "react-native";
import { router } from "expo-router";
import { ListChecksIcon } from "@/components/icons";
import { Button, ModalScreen, PracticeBadge, ScreenSkeleton, Txt } from "@/components/ui";
import type { WithdrawalRow } from "@/lib/api/types";
import { space } from "@/theme";
import { TalkToPerson, TextLink } from "../components/Links";
import { amountText } from "../describe";
import type { FlowVault, StepNav } from "./types";

const DONE: Record<string, string> = {
  paid: "This withdrawal has already been paid.",
  cancelled: "This withdrawal was cancelled, so the money stayed in the vault.",
  expired: "No bill arrived in time, so this withdrawal closed and the money stayed in the vault.",
};

/**
 * Opening the flow for an existing request (`?withdrawalId=`). The flow jumps straight to the
 * right step once the request loads; this covers the moments before that, and requests that
 * are already finished or can't be found.
 */
/** Statuses (live and Practice) while a bill is being checked or is with a person. */
const CHECKING = new Set(["processing", "verifying", "in_review", "appealed"]);

/** Where the flow picks up an existing request, or null when there's nothing left to do. */
export function resumeTarget(row: WithdrawalRow): "proof" | "verifying" | null {
  if (row.status === "awaiting_proof" || row.status === "denied") return "proof";
  if (CHECKING.has(row.status) && row.proof_id) return "verifying";
  return null;
}

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
            ? `${amountText(row.amount, vault.currency)}${row.payee ? ` to ${row.payee}` : ""}. ${DONE[row.status] ?? "This withdrawal is finished."}`
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
