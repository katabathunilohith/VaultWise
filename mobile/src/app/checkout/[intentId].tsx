import { useLocalSearchParams } from "expo-router";
import { CheckoutScreen } from "@/features/pay/checkout/CheckoutScreen";

/** Pay with Vaultwise checkout, opened from a scan, a pending card, a merchant code or a link. */
export default function CheckoutRoute() {
  const { intentId } = useLocalSearchParams<{ intentId?: string | string[] }>();
  return <CheckoutScreen intentId={Array.isArray(intentId) ? intentId[0] : intentId} />;
}
