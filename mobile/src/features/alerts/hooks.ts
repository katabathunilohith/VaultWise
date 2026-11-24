import { useCallback } from "react";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { queryClient, useApiQuery } from "@/lib/api/hooks";
import { byKey, invalidate, qk } from "@/lib/api/keys";
import type { AlertsList } from "@/lib/api/security-types";
import { ALERTS_ENABLED, ALERTS_POLL_MS } from "./config";

/** A server without plan 06 answers 404: stop asking until the app starts again. */
const missing = (e: unknown) => e instanceof ApiError && e.status === 404;

/**
 * The inbox, newest first, shared by the bell and the screen: fetched again when the app or the
 * screen comes back into focus, and every minute while the app is open. After a money move,
 * useInvalidateMoney() refreshes it too (it's in MONEY_QUERIES).
 */
export function useAlerts({ enabled = true }: { enabled?: boolean } = {}) {
  return useApiQuery(qk.alerts(), api.alerts, {
    enabled: ALERTS_ENABLED && enabled,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => (missing(q.state.error) ? false : ALERTS_POLL_MS),
    retry: (count, e) => !missing(e) && count < 1,
  });
}

/** Marks these alerts (or all) read: at once on screen, then on the server. */
export function useMarkAlertsRead() {
  return useCallback(async (ids?: string[]) => {
    const now = Date.now();
    const wanted = ids ? new Set(ids) : null;
    queryClient.setQueriesData<AlertsList>({ predicate: byKey(qk.alerts()) }, (old) => {
      if (!old) return old;
      const alerts = old.alerts.map((a) => (a.readAt === null && (!wanted || wanted.has(a.id)) ? { ...a, readAt: now } : a));
      return { alerts, unread: alerts.filter((a) => a.readAt === null).length };
    });
    try {
      await api.markAlertsRead(ids);
    } finally {
      void invalidate(queryClient, "alerts");
    }
  }, []);
}
