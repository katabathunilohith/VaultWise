import { api } from "@/lib/api/client";
import { useApiQuery, useMe } from "@/lib/api/hooks";
import { qk } from "@/lib/api/keys";

/**
 * The market whose ID types to offer first: the account's own, or (signed out) a guess from where
 * the phone is. "IN" for India; any other country gets the passport and national ID list; null when
 * nothing is known, which offers every type.
 */
export function useIdMarket(): string | null {
  const me = useMe();
  const region = useApiQuery(qk.region(), api.region, { staleTime: Infinity, retry: 0 });
  if (me.data?.onboarded) return me.data.user.jurisdiction;
  const country = region.data?.guess.country;
  if (!country) return null;
  return country === "IN" ? "IN" : "OTHER";
}
