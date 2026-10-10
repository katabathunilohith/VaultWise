import { useCallback, useEffect, useMemo, useRef } from "react";
import { AppState, BackHandler } from "react-native";
import { useFocusEffect, useIsFocused } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { isDemoProof } from "@/lib/api/demo";
import { useConnection, useMe } from "@/lib/api/hooks";
import type { ProofView } from "@/lib/api/types";
import { haptic } from "@/lib/haptics";
import { practiceHistoryProof } from "./history";
import { outcomeOf } from "./verdict";

/** The rulebook values the proof screens quote, with the defaults the server ships. */
export function useProofRules() {
  const me = useMe();
  const d = me.data?.onboarded ? me.data : null;
  return {
    currency: d?.user.currency ?? null,
    userName: d?.user.name ?? null,
    reviewSlaHours: d?.rules.verification.reviewSlaHours ?? 4,
    maxDocAgeDays: d?.rules.verification.maxDocAgeDays ?? 120,
  };
}

const POLL_MS = 400;

/**
 * A proof by id, polled every 400 ms until it has an outcome. Same cache entry as the shared
 * `useProof`, but polling stops on any outcome, including a check the server handed to a person
 * after an error (status "error"), which `useProof` would keep polling forever.
 */
export function useProofPoll(id: string | undefined) {
  const { mode, checked } = useConnection();
  return useQuery({
    queryKey: [mode, "proof", id],
    queryFn: () => api.proof(id!),
    enabled: checked && !!id,
    refetchInterval: (q) => (outcomeOf(q.state.data?.verification) ? false : POLL_MS),
  });
}

/**
 * A proof by id, polled until verification completes. In Practice mode, snapshot proofs the
 * simulator doesn't hold (the sample emergency receipt) are rebuilt from the fixtures.
 */
export function useProofRecord(id: string | undefined) {
  const { mode } = useConnection();
  // Don't ask the simulator for ids it doesn't hold (and don't poll a 404).
  const practice = useMemo(() => (mode === "demo" && id && !isDemoProof(id) ? practiceHistoryProof(id) : null), [mode, id]);
  const q = useProofPoll(practice ? undefined : id);
  const data: ProofView | undefined = practice ?? q.data;
  return {
    data,
    error: data ? null : q.error,
    refetch: () => (practice ? Promise.resolve() : q.refetch()),
    fromPracticeHistory: !!practice,
  };
}

/** Refetches one proof (after an appeal, say). */
export function useRefreshProof() {
  const qc = useQueryClient();
  return useCallback((id: string) => qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === "proof" && q.queryKey[2] === id }), [qc]);
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

/** Android back: run `handler` (return true when handled) while this screen is focused. */
export function useHardwareBack(handler: () => boolean) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => ref.current());
      return () => sub.remove();
    }, []),
  );
}
