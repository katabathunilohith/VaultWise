import { useMemo } from "react";
import { useWallet } from "@/features/wallet/hooks"; // wallet
import { useActivity, useInvestCore } from "@/lib/api/hooks";
import type { Dashboard } from "@/lib/api/types";
import { lastPayday } from "./activity-model";
import { upcomingMoves } from "./schedule";

/**
 * Scheduled moves for the next `days` days, from the dashboard's vault rules plus the Core SIP.
 * The SIP and payday estimate are optional: if they fail to load, vault moves still show and
 * `sipError` says what's missing.
 */
export function useUpcoming(dashboard: Dashboard | undefined, now: number, days = 30) {
  const core = useInvestCore();
  const activity = useActivity();
  const fixedFrom = useWallet().data?.autoSaveSource; // wallet: only fixed auto-saves follow this choice
  const moves = useMemo(
    () =>
      dashboard
        ? upcomingMoves({
            vaults: dashboard.vaults,
            sips: core.data?.sips,
            pendingRoundups: dashboard.roundups,
            lastPayday: lastPayday(activity.data),
            fixedFrom,
            now,
            days,
          })
        : [],
    [dashboard, core.data, activity.data, fixedFrom, now, days],
  );
  return { moves, sipPending: core.isPending, sipError: core.isError ? core.error : null, retrySip: () => void core.refetch() };
}
