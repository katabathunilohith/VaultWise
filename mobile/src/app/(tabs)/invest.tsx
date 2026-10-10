import { InvestScreen } from "@/features/invest/InvestScreen";
import { useRefreshOnFocus } from "@/lib/api/hooks";

/** Invest tab root. The screen lives in src/features/invest. */
export default function InvestTab() {
  useRefreshOnFocus();
  return <InvestScreen />;
}
