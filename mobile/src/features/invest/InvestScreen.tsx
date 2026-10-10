import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/ui";
import { CoreView } from "./core/CoreView";
import { InvestHeader, type InvestView } from "./InvestHeader";
import { PracticeView } from "./practice/PracticeView";

const KEYS: Record<InvestView, string[]> = {
  core: ["invest-core", "portfolio"],
  practice: ["portfolio", "invest-satellite"],
};

/**
 * Invest tab root (calm core). Core is the long-term model portfolio; Practice is the
 * paper-trading sleeve. No haptics beyond the kit's own taps, no celebrations, never advice.
 */
export function InvestScreen() {
  const qc = useQueryClient();
  const [view, setView] = useState<InvestView>("core");
  // Active queries only: inactive ones include the other connection mode's cache (live while in
  // demo), and refetching those would hit a server that can't be reached and hang the spinner.
  const refresh = () => qc.refetchQueries({ type: "active", predicate: (q) => KEYS[view].includes(String(q.queryKey[1])) });
  return (
    <Screen onRefresh={refresh}>
      <InvestHeader view={view} onView={setView} />
      {view === "core" ? <CoreView /> : <PracticeView />}
    </Screen>
  );
}
