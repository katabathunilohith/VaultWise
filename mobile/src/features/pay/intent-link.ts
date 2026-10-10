/**
 * Turns what the scanner reads (or what someone types) into a Pay with Vaultwise intent id.
 * Only the id is taken from a code; the app never opens the scanned URL itself, and the
 * checkout screen loads the intent (and its verified merchant) from Vaultwise.
 */
import type { PaymentIntent } from "@/lib/api/pay-types";

const RAW_ID = /^pi_[A-Za-z0-9_-]{2,64}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{3,64}$/;
const APP_LINK = /^vaultwise:\/\/pay\/([^/?#\s]+)/i;
const WEB_LINK = /^https?:\/\/[^/?#\s]+(?:\/[^?#\s]*)?\/pay\/([^/?#\s]+)\/?(?:[?#].*)?$/i;

/** Merchant codes printed under the QR code. In Practice they map to the sample checkouts. */
const MERCHANT_CODES: Record<string, { merchantId: string; intentId: string }> = {
  CITYGEN: { merchantId: "mer_citygeneral", intentId: "pi_demo_citygeneral" },
  WESTFIELD: { merchantId: "mer_westfield", intentId: "pi_demo_westfield" },
  GREENLEAF: { merchantId: "mer_greenleaf", intentId: "pi_demo_greenleaf" },
};

export const PRACTICE_MERCHANT_CODES = Object.keys(MERCHANT_CODES);

function decode(part: string) {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

/** Accepts "vaultwise://pay/<id>", "https://…/pay/<id>" or a raw "pi_…" id. */
export function parseIntentId(raw: string): string | null {
  const s = raw.trim();
  if (RAW_ID.test(s)) return s;
  const match = APP_LINK.exec(s) ?? WEB_LINK.exec(s);
  if (!match) return null;
  const id = decode(match[1]);
  return id && SAFE_ID.test(id) ? id : null;
}

/**
 * A typed merchant code, intent id or pay link → intent id, or null when it isn't recognised.
 * A code names the merchant, not one bill: it opens that merchant's newest checkout in
 * `checkouts`, preferring one still waiting (an earlier one may be paid already).
 */
export function resolveMerchantCode(input: string, checkouts: readonly PaymentIntent[] = []): string | null {
  const fromLink = parseIntentId(input);
  if (fromLink) return fromLink;
  const code = input.trim().toUpperCase().replace(/[\s-]/g, "");
  const merchant = MERCHANT_CODES[code];
  if (!merchant) return null;
  const theirs = checkouts.filter((i) => i.merchant.id === merchant.merchantId).sort((a, b) => b.createdAt - a.createdAt);
  return (theirs.find((i) => i.status === "requires_customer") ?? theirs[0])?.id ?? merchant.intentId;
}
