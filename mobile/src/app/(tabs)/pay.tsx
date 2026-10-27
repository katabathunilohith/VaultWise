import { PayScreen } from "@/features/pay/PayScreen";
import { TabSwipe } from "@/features/tab-swipe";
import { useRefreshOnFocus } from "@/lib/api/hooks";

/** Pay tab: scanner-first, with pending checkouts and merchant-code entry below. */
export default function PayTab() {
  useRefreshOnFocus();
  return (
    <TabSwipe tab="pay">
      <PayScreen />
    </TabSwipe>
  );
}
