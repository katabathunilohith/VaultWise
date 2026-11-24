import {
  focusManager,
  QueryClient,
  useQuery,
  useQueryClient,
  type DefaultError,
  type QueryFunction,
  type QueryKey,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useCallback, useRef, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "./client";
import { getConnection, subscribeConnection } from "./connection";
import { ApiError } from "./errors";
import { invalidate, MONEY_QUERIES, qk, withMode, type ApiKey } from "./keys";

/**
 * Only data older than staleTime is fetched again on focus: coming back to the app, or to a tab.
 * Money moves in the background (checks finish, payouts land), so a screen shouldn't keep
 * showing what it had when it was last opened.
 *
 * A failed read is tried once more only when no answer came or the server failed (status 0 or 5xx).
 * A 4xx answer is the server's decision, so asking again at once can't help; for a 429 (`rate_limited`,
 * the per-person limit that GET /me counts toward too) it would only make things worse. The data on
 * screen stays, and the next focus or refresh asks again.
 */
export function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: shouldRetry, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

/**
 * On a phone, the app coming back to the foreground counts as window focus (TanStack Query's
 * React Native recipe). The browser already reports focus by itself.
 */
export function initQueryFocus() {
  if (Platform.OS === "web") return undefined;
  const sub = AppState.addEventListener("change", (state) => focusManager.setFocused(state === "active"));
  return () => sub.remove();
}

/**
 * Tabs stay mounted, so going back to one doesn't refetch anything by itself. On every focus after
 * the first, this re-reads whatever on screen has gone stale.
 */
export function useRefreshOnFocus() {
  const qc = useQueryClient();
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      void qc.refetchQueries({ type: "active", stale: true });
    }, [qc]),
  );
}

/** Re-renders when the app switches between live and demo data. */
export function useConnection() {
  return useSyncExternalStore(subscribeConnection, getConnection, getConnection);
}

type ApiQueryOptions<T> = Omit<UseQueryOptions<T, DefaultError, T, QueryKey>, "queryKey" | "queryFn" | "enabled"> & {
  /** Also waits for the first connection check, like every API query. */
  enabled?: boolean;
};

/**
 * A query against the API. Its key (from `qk`) gets the connection mode, so switching live/demo
 * never shows the other source's cache, and nothing is fetched until the first connection check
 * has picked a source.
 */
export function useApiQuery<T>(key: ApiKey, queryFn: QueryFunction<T, QueryKey>, { enabled = true, ...options }: ApiQueryOptions<T> = {}) {
  const { mode, checked } = useConnection();
  return useQuery<T, DefaultError, T, QueryKey>({ ...options, queryKey: withMode(mode, key), queryFn, enabled: checked && enabled });
}

/** How long /me counts as fresh: it's read by most screens and on every focus, and counts toward the per-person rate limit. */
const ME_STALE_MS = 30_000;

/**
 * GET /me. A 429 keeps the last answer on screen and is never read as a sign-out (only `signed_out`
 * is, features/auth). Screens that need it current invalidate it themselves (the MPIN lock, a new phone number).
 */
export function useMe() {
  return useApiQuery(qk.me(), api.me, { staleTime: ME_STALE_MS });
}

/** The currency to show when nothing more specific is known (the Practice wallet's). */
export const DEFAULT_CURRENCY = "INR";

/** What the server's rulebook ships with, quoted until /me answers for an onboarded account. */
const RULE_DEFAULTS = { reviewSlaHours: 4, maxDocAgeDays: 120, tier2HoldSeconds: 90, receiptWindowDays: 14 };

/**
 * The customer's rulebook as screens quote it, with the published defaults filled in. Currency,
 * locale and name stay null until /me answers for an onboarded account, so a screen can try
 * something more specific (a receipt's own currency, say) before DEFAULT_CURRENCY.
 */
export function useRules() {
  const me = useMe();
  const d = me.data?.onboarded ? me.data : null;
  return {
    currency: d?.user.currency ?? null,
    locale: d?.rules.locale ?? null,
    userName: d?.user.name ?? null,
    reviewSlaHours: d?.rules.verification.reviewSlaHours ?? RULE_DEFAULTS.reviewSlaHours,
    maxDocAgeDays: d?.rules.verification.maxDocAgeDays ?? RULE_DEFAULTS.maxDocAgeDays,
    tier2HoldSeconds: d?.rules.emergency.tier2HoldSeconds ?? RULE_DEFAULTS.tier2HoldSeconds,
    receiptWindowDays: d?.rules.emergency.receiptWindowDays ?? RULE_DEFAULTS.receiptWindowDays,
  };
}

export function useDashboard() {
  return useApiQuery(qk.dashboard(), api.dashboard);
}

export function useVaults() {
  return useApiQuery(qk.vaults(), api.vaults);
}

export function useVault(id: string | undefined) {
  return useApiQuery(qk.vault(id), () => api.vault(id!), { enabled: !!id });
}

export function useEmergency() {
  return useApiQuery(qk.emergency(), api.emergency);
}

export function useLimits() {
  return useApiQuery(qk.limits(), api.limits);
}

export function usePortfolio() {
  return useApiQuery(qk.portfolio(), api.portfolio);
}

export function useInvestCore() {
  return useApiQuery(qk.investCore(), api.investCore);
}

export function useInvestSatellite() {
  return useApiQuery(qk.investSatellite(), api.investSatellite);
}

export function useInsight() {
  return useApiQuery(qk.insight(), api.insight, { staleTime: 5 * 60_000 });
}

export function useActivity() {
  return useApiQuery(qk.activity(), api.activity);
}

export function useAccounts() {
  return useApiQuery(qk.accounts(), api.accounts);
}

export function useBadges() {
  return useApiQuery(qk.badges(), api.badges);
}

export function useSamples() {
  return useApiQuery(qk.samples(), api.samples, { staleTime: Infinity });
}

/** Polls a Pay with Vaultwise checkout while it's being processed. */
export function useCheckout(id: string | undefined) {
  return useApiQuery(qk.checkout(id), () => api.checkout(id!), {
    enabled: !!id,
    refetchInterval: (q) => (q.state.status !== "error" && q.state.data?.status === "processing" ? 300 : false),
  });
}

export function usePayIntents() {
  return useApiQuery(qk.payIntents(), api.payIntents);
}

/** Refreshes everything that shows balances (MONEY_QUERIES), after money moves. */
export function useInvalidateMoney() {
  const qc = useQueryClient();
  return () => invalidate(qc, ...MONEY_QUERIES);
}
