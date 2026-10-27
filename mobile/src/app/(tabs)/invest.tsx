import { InvestScreen } from "@/features/invest/InvestScreen";
import { TabSwipe } from "@/features/tab-swipe";
import { useRefreshOnFocus } from "@/lib/api/hooks";

/** Invest tab root. The screen lives in src/features/invest. */
export default function InvestTab() {
  useRefreshOnFocus();
  return (
    <TabSwipe tab="invest">
      <InvestScreen />
    </TabSwipe>
  );
}
