import { useEffect, useEffectEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useApiQuery, useMe } from "@/lib/api/hooks";
import type { Me } from "@/lib/api/types";
import { invalidate, qk } from "@/lib/api/keys";
import { usePracticeMode } from "@/lib/api/practice";

/** True while the account is read-only because a recovery request waits for a person. */
export function isRecoveryAccess(me: Me | undefined) {
  return !!me?.onboarded && me.auth?.access === "recovery";
}

/**
 * The signed-in person's latest recovery request. While one is pending it's checked again every
 * 30 seconds (every 4 in Practice, where the pretend person decides after about 20).
 */
export function useRecoveryClaim({ enabled = true, watch = false }: { enabled?: boolean; watch?: boolean } = {}) {
  const practice = usePracticeMode();
  return useApiQuery(qk.recovery(), api.recoveryClaim, {
    enabled,
    retry: 0,
    refetchInterval: (q) => (watch && q.state.data?.status === "pending" ? (practice ? 4_000 : 30_000) : false),
  });
}

/**
 * Keeps the read-only state honest: while the account waits for a person, the request is watched,
 * and when it's decided (or cancelled) /me is read again so the gate and the banner follow.
 */
export function useRecoveryWatch(active: boolean) {
  const qc = useQueryClient();
  const me = useMe();
  const claim = useRecoveryClaim({ enabled: active, watch: true });
  const status = claim.data?.status;
  const meClaimId = me.data?.recovery?.claimId;
  const refresh = useEffectEvent(() => void invalidate(qc, "me"));
  useEffect(() => {
    if (!active || !status) return;
    // /me still says read-only, but the request isn't waiting any more.
    if (status !== "pending") refresh();
  }, [active, status, meClaimId]);
}
