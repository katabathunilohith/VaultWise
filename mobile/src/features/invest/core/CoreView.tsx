import { useState } from "react";
import { router } from "expo-router";
import { EmptyState, ScreenSkeleton, SectionHeader, Stack, Txt } from "@/components/ui";
import { space } from "@/theme";
import { CalmError } from "../CalmError";
import { asFrequency } from "../format";
import { activePlan, hasPortfolio, useCoreData } from "../use-invest";
import { CoreActions, CoreHero, PlanCard } from "./CoreSummary";
import { Holdings } from "./Holdings";
import { LumpSumModal } from "./LumpSumModal";
import { ModelPortfolio } from "./ModelPortfolio";
import { PlanModal } from "./PlanModal";

type Sheet = "plan" | "lump" | null;

/** Core: the long-term model portfolio, bought on a plan or as lump sums. Calm, no celebrations. */
export function CoreView() {
  const q = useCoreData();
  const [sheet, setSheet] = useState<Sheet>(null);
  // A fresh key per open remounts the flow, so every visit starts at its first step.
  const [opens, setOpens] = useState(0);

  if (!q.data) return q.error ? <CalmError error={q.error} onRetry={() => void q.refetch()} /> : <ScreenSkeleton />;
  const core = q.data;
  if (!hasPortfolio(core))
    return (
      <EmptyState
        title="Your risk quiz comes first"
        body="Core builds its mix from a short quiz about how you handle ups and downs. For now the quiz is in Vaultwise on the web."
      />
    );

  const plan = activePlan(core);
  const open = (s: Exclude<Sheet, null>) => {
    setOpens((n) => n + 1);
    setSheet(s);
  };
  const close = () => setSheet(null);
  const askPerson = () => router.push("/support");

  return (
    <Stack gap={space.lg}>
      <CoreHero core={core} />
      {/* Inline actions sit right under the hero so they land in the lower middle (R4). */}
      <Stack gap={space.sm}>
        <CoreActions core={core} onPlan={() => open("plan")} onLumpSum={() => open("lump")} />
        <PlanCard core={core} />
      </Stack>

      <Stack gap={space.xs}>
        <SectionHeader title="Your model portfolio" />
        <ModelPortfolio core={core} />
      </Stack>

      <Stack gap={space.xs}>
        <SectionHeader title="Holdings" />
        <Holdings core={core} />
      </Stack>

      <Txt v="caption" color="textMuted" align="center">
        Simulated with real prices. Not investment advice.
      </Txt>

      <PlanModal
        key={`plan-${opens}`}
        visible={sheet === "plan"}
        onClose={close}
        onAskPerson={askPerson}
        currency={core.currency}
        bandName={core.band.name}
        plan={plan ? { amount: plan.amount, frequency: asFrequency(plan.frequency) } : null}
      />
      <LumpSumModal
        key={`lump-${opens}`}
        visible={sheet === "lump"}
        onClose={close}
        onAskPerson={askPerson}
        currency={core.currency}
        bandName={core.band.name}
        allocations={core.allocations}
      />
    </Stack>
  );
}
