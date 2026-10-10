import { focusManager, QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "./client";
import { getConnection, subscribeConnection } from "./connection";

/**
 * Only data older than staleTime is fetched again on focus: coming back to the app, or to a tab.
 * Money moves in the background (checks finish, payouts land), so a screen shouldn't keep
 * showing what it had when it was last opened.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true },
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

/** Query keys carry the mode, so switching live/demo never shows the other source's cache. */
function useKey(...parts: unknown[]) {
  const { mode, checked } = useConnection();
  return { key: [mode, ...parts], enabled: checked };
}

export function useMe() {
  const { key, enabled } = useKey("me");
  return useQuery({ queryKey: key, queryFn: api.me, enabled });
}

export function useDashboard() {
  const { key, enabled } = useKey("dashboard");
  return useQuery({ queryKey: key, queryFn: api.dashboard, enabled });
}

export function useVaults() {
  const { key, enabled } = useKey("vaults");
  return useQuery({ queryKey: key, queryFn: api.vaults, enabled });
}

export function useVault(id: string | undefined) {
  const { key, enabled } = useKey("vault", id);
  return useQuery({ queryKey: key, queryFn: () => api.vault(id!), enabled: enabled && !!id });
}

export function useEmergency() {
  const { key, enabled } = useKey("emergency");
  return useQuery({ queryKey: key, queryFn: api.emergency, enabled });
}

export function useLimits() {
  const { key, enabled } = useKey("limits");
  return useQuery({ queryKey: key, queryFn: api.limits, enabled });
}

export function usePortfolio() {
  const { key, enabled } = useKey("portfolio");
  return useQuery({ queryKey: key, queryFn: api.portfolio, enabled });
}

export function useInvestCore() {
  const { key, enabled } = useKey("invest-core");
  return useQuery({ queryKey: key, queryFn: api.investCore, enabled });
}

export function useInvestSatellite() {
  const { key, enabled } = useKey("invest-satellite");
  return useQuery({ queryKey: key, queryFn: api.investSatellite, enabled });
}

export function useInsight() {
  const { key, enabled } = useKey("insight");
  return useQuery({ queryKey: key, queryFn: api.insight, enabled, staleTime: 5 * 60_000 });
}

export function useActivity() {
  const { key, enabled } = useKey("activity");
  return useQuery({ queryKey: key, queryFn: api.activity, enabled });
}

export function useAccounts() {
  const { key, enabled } = useKey("accounts");
  return useQuery({ queryKey: key, queryFn: api.accounts, enabled });
}

export function useBadges() {
  const { key, enabled } = useKey("badges");
  return useQuery({ queryKey: key, queryFn: api.badges, enabled });
}

export function useSamples() {
  const { key, enabled } = useKey("samples");
  return useQuery({ queryKey: key, queryFn: api.samples, enabled, staleTime: Infinity });
}

/** Polls a proof every 400 ms until its verification completes. */
export function useProof(id: string | undefined) {
  const { key, enabled } = useKey("proof", id);
  return useQuery({
    queryKey: key,
    queryFn: () => api.proof(id!),
    enabled: enabled && !!id,
    // Stop when the check finishes, fails on the server ("error" means it went to a person), or the request errors.
    refetchInterval: (q) => {
      if (q.state.status === "error") return false;
      const s = q.state.data?.verification.status;
      return s === "complete" || s === "error" ? false : 400;
    },
  });
}

/** Polls a Pay with Vaultwise checkout while it's being processed. */
export function useCheckout(id: string | undefined) {
  const { key, enabled } = useKey("checkout", id);
  return useQuery({
    queryKey: key,
    queryFn: () => api.checkout(id!),
    enabled: enabled && !!id,
    refetchInterval: (q) => (q.state.status !== "error" && q.state.data?.status === "processing" ? 300 : false),
  });
}

export function useDemoIntents() {
  const { key, enabled } = useKey("pay-intents");
  return useQuery({ queryKey: key, queryFn: api.demoIntents, enabled });
}

/** Refreshes everything that shows balances, after money moves. */
export function useInvalidateMoney() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ["dashboard", "vaults", "vault", "emergency", "limits", "activity", "badges", "portfolio", "pay-intents", "invest-core", "invest-satellite", "checkout", "accounts"].map((k) =>
        qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === k }),
      ),
    );
}
