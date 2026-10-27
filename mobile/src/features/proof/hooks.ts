import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { useApiQuery } from "@/lib/api/hooks";
import { byKey, qk } from "@/lib/api/keys";
import { haptic } from "@/lib/haptics";
import { outcomeOf } from "./verdict";

const POLL_MS = 400;
/** After a network or server error, keep trying, but more gently. */
const RETRY_MS = 2500;

/** A 4xx answer (not found, not yours) won't change by asking again. */
const isFinalError = (e: unknown) => e instanceof ApiError && e.status >= 400 && e.status < 500;

/**
 * A proof by id, polled every 400 ms until it has an outcome. That includes a check the server
 * handed to a person after an error (status "error"), so polling stops there too. A dropped
 * connection or a server error doesn't stop it: it retries every few seconds, as the Verifying
 * screen promises. Only an answer that can't change (a 4xx, such as not found) stops it.
 */
export function useProofPoll(id: string | undefined) {
  return useApiQuery(qk.proof(id), () => api.proof(id!), {
    enabled: !!id,
    refetchInterval: (q) => {
      if (outcomeOf(q.state.data?.verification)) return false;
      if (q.state.status === "error") return isFinalError(q.state.error) ? false : RETRY_MS;
      return POLL_MS;
    },
  });
}

/**
 * A proof by id, polled until verification completes. In Practice, a record from the sample
 * snapshot says so (`fromPracticeHistory`).
 */
export function useProofRecord(id: string | undefined) {
  const q = useProofPoll(id);
  const data = q.data;
  return {
    data,
    error: data ? null : q.error,
    refetch: () => q.refetch(),
    fromPracticeHistory: !!data?.practiceSnapshot,
  };
}

/** Refetches one proof (after an appeal, say). */
export function useRefreshProof() {
  const qc = useQueryClient();
  return useCallback((id: string) => qc.invalidateQueries({ predicate: byKey(qk.proof(id)) }), [qc]);
}

const BEAT_MS = 1200;
const MAX_BEATS = 6;

/**
 * The verifying heartbeat: `proof.verifying` every 1.2 s while the pipeline runs and the screen is
 * focused and in the foreground, at most 6 beats. Returns the time of the last beat, so the
 * outcome can wait until the heartbeat has stopped.
 */
export function useVerifyingHeartbeat(running: boolean) {
  const focused = useIsFocused();
  const beats = useRef(0);
  const lastBeat = useRef(0);
  useEffect(() => {
    if (!running || !focused) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const beat = () => {
      if (beats.current >= MAX_BEATS || AppState.currentState !== "active") return;
      beats.current += 1;
      lastBeat.current = Date.now();
      haptic("proof.verifying");
    };
    beat();
    timer = setInterval(beat, BEAT_MS);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [running, focused]);
  return lastBeat;
}
