import { HomeScreen } from "@/features/home/HomeScreen";
import { TabSwipe } from "@/features/tab-swipe";
import { useRefreshOnFocus } from "@/lib/api/hooks";

/** Home tab root. The screen lives in src/features/home. */
export default function Home() {
  useRefreshOnFocus();
  return (
    <TabSwipe tab="index">
      <HomeScreen />
    </TabSwipe>
  );
}
