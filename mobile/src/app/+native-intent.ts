import { parseIntentId } from "@/features/pay/intent-link";
import { setPendingCheckout } from "@/lib/pending-checkout";

/**
 * Links from outside the app (native only). A merchant link, vaultwise://pay/<intentId>, isn't
 * opened as a route: the app may be locked or still onboarding, and the checkout is closed to
 * both. The id is kept instead, and the root layout opens the checkout once the person is in
 * (right away when they already are). A pay link with an id that isn't valid is dropped. Every
 * other link is passed through unchanged.
 */

/** Dev builds and Expo Go also send exp://host/--/pay/<id> or a bare /pay/<id> path. */
const PAY_PATH = /^(?:[a-z][a-z0-9+.-]*:\/\/[^/?#]*)?(?:\/--)?\/pay\/([^/?#\s]+)\/?(?:[?#].*)?$/i;
/**
 * Anything that would open the pay/[intentId] route, whether its id is valid or not:
 * vaultwise://pay/<x>, https://…/pay/<x>, exp://…/--/pay/<x> or /pay/<x>. A bare /pay is the
 * Pay tab and isn't matched.
 */
const PAY_LINK = /^(?:vaultwise:\/\/|(?:[a-z][a-z0-9+.-]*:\/\/[^/?#]*)?(?:\/--)?\/)pay\/[^/?#\s]/i;

function intentIdFrom(path: string): string | null {
  const direct = parseIntentId(path);
  if (direct) return direct;
  const m = PAY_PATH.exec(path.trim());
  // Re-check the id the same way as a merchant link, so only a safe id is ever kept.
  return m ? parseIntentId(`vaultwise://pay/${m[1]}`) : null;
}

/** Where to go instead of a link the app doesn't open: Home on launch, else stay put. */
const drop = (initial: boolean) => (initial ? "/" : null);

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    const id = intentIdFrom(path);
    if (!id) return PAY_LINK.test(path.trim()) ? drop(initial) : path;
    setPendingCheckout(id);
    // On launch, start at Home (or Unlock / Welcome, which the root layout picks). Later links
    // leave the current screen alone; the checkout opens on top of it.
    return drop(initial);
  } catch {
    // Never pass a pay link through to its route, even after a failure.
    return initial || PAY_LINK.test(String(path).trim()) ? drop(initial) : path;
  }
}
