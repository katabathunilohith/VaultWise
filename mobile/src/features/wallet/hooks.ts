import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { useApiQuery } from "@/lib/api/hooks";
import { invalidate, qk } from "@/lib/api/keys";
import { WALLET_ENABLED } from "./config";

/**
 * The wallet: balance, safe to spend today, the daily limit and recent activity. Not fetched while
 * switched off. A 403 (account on hold) or 404 (no wallet on this server) won't change on a retry.
 */
export function useWallet() {
  return useApiQuery(qk.wallet(), api.wallet, {
    enabled: WALLET_ENABLED,
    retry: (count, e) => count < 1 && !(e instanceof ApiError && (e.status === 403 || e.status === 404)),
  });
}

/** Re-reads the wallet after a settings change (no money moved, so balances elsewhere are current). */
export function useRefreshWallet() {
  const qc = useQueryClient();
  return () => invalidate(qc, "wallet");
}

/** True when the server answered that it has no wallet (an older server, or the wallet is off there). */
export function walletMissing(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}
