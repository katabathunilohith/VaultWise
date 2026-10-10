import { Redirect, useLocalSearchParams } from "expo-router";
import { parseIntentId } from "@/features/pay/intent-link";

/**
 * Merchant links: vaultwise://pay/<intentId> (and https://…/pay/<intentId> once universal links
 * are set up). On a phone, +native-intent catches these first and opens the checkout once the app
 * is unlocked; this route covers the web preview and in-app links. It sits behind the same guard as
 * the checkout, so it never shows over Unlock or Welcome. The Pay tab itself is /pay.
 */
export default function PayLink() {
  const { intentId } = useLocalSearchParams<{ intentId?: string | string[] }>();
  const raw = Array.isArray(intentId) ? intentId[0] : intentId;
  // Checked as a link, so it accepts exactly the ids a merchant link can carry.
  const id = raw ? parseIntentId(`vaultwise://pay/${encodeURIComponent(raw)}`) : null;
  if (!id) return <Redirect href="/" />;
  return <Redirect href={{ pathname: "/checkout/[intentId]", params: { intentId: id } }} />;
}
