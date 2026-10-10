import { PayScreen } from "@/features/pay/PayScreen";
import { useRefreshOnFocus } from "@/lib/api/hooks";

/** Pay tab: scanner-first, with pending checkouts and merchant-code entry below. */
export default function PayTab() {
  useRefreshOnFocus();
  return <PayScreen />;
}
