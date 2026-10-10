import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useConnection } from "@/lib/api/hooks";
import type { Minor } from "@/lib/api/types";

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Live plan preview for the amount being typed (debounced), so people see how the money splits
 * before they continue. `current` is only set once the preview matches the amount on screen.
 */
export function usePlanPreview(amount: Minor | null) {
  const { mode, checked } = useConnection();
  const debounced = useDebounced(amount, 350);
  const q = useQuery({
    queryKey: [mode, "emergency-preview", debounced],
    queryFn: () => api.emergencyPreview((debounced ?? 0) / 100),
    enabled: checked && debounced !== null && debounced > 0,
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 60_000,
    retry: 0,
  });
  const matches = !!q.data && amount !== null && q.data.amount === amount && !q.isPlaceholderData;
  return {
    /** The preview for exactly this amount, fresh. */
    current: matches && !q.isFetching && q.data ? q.data : null,
    /** Whatever preview is on hand (may be for the previous amount) — shown dimmed while updating. */
    shown: amount ? (q.data ?? null) : null,
    updating: !!amount && (!matches || q.isFetching),
    error: amount !== null && q.isError && debounced === amount ? q.error : null,
    retry: () => void q.refetch(),
  };
}
