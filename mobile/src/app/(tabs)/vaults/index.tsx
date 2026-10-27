import { VaultsListScreen } from "@/features/vaults/VaultsListScreen";
import { TabSwipe } from "@/features/tab-swipe";
import { useRefreshOnFocus } from "@/lib/api/hooks";

/** Vaults tab root. */
export default function VaultsRoute() {
  useRefreshOnFocus();
  return (
    <TabSwipe tab="vaults">
      <VaultsListScreen />
    </TabSwipe>
  );
}
