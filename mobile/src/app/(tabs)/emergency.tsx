import { EmergencyHome } from "@/features/emergency/home/EmergencyHome";
import { TabSwipe } from "@/features/tab-swipe";
import { useRefreshOnFocus } from "@/lib/api/hooks";

/** Emergency tab root. The screen lives in src/features/emergency. */
export default function EmergencyTab() {
  useRefreshOnFocus();
  return (
    <TabSwipe tab="emergency">
      <EmergencyHome />
    </TabSwipe>
  );
}
