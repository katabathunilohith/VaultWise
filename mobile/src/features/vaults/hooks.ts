import { useCallback, useEffect, useState } from "react";
import { DEFAULT_CURRENCY, useRules } from "@/lib/api/hooks";
import type { Vault } from "@/lib/api/types";
import { getItem, setItem } from "@/lib/storage";
import { milestoneLevel } from "./format";

/** The customer's wallet currency (else `fallback`, else the Practice wallet's). */
export function useCurrency(fallback?: string) {
  return useRules().currency ?? fallback ?? DEFAULT_CURRENCY;
}

/** Numbers the release contract quotes, from the customer's rulebook (with the published defaults). */
export function useReleaseRules() {
  const { tier2HoldSeconds, receiptWindowDays, reviewSlaHours } = useRules();
  return { tier2HoldSeconds, receiptWindowDays, reviewSlaHours };
}

/* ---------- milestones (last seen quarter per vault, kept on the device) ---------- */

const milestoneKey = (vaultId: string) => `vw.milestone.${vaultId.replace(/[^\w.-]/g, "_")}`;

export async function readSeenMilestone(vaultId: string): Promise<number | null> {
  const raw = await getItem(milestoneKey(vaultId));
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function writeSeenMilestone(vaultId: string, level: number) {
  return setItem(milestoneKey(vaultId), String(level));
}

/**
 * Records a vault's new progress and says whether it crossed a quarter it hadn't reached
 * when last seen. Returns the level to celebrate, or null.
 */
export async function recordMilestone(vaultId: string, progress: number, previous?: number): Promise<number | null> {
  const level = milestoneLevel(progress);
  const seen = (await readSeenMilestone(vaultId)) ?? previous ?? null;
  if (seen !== level) await writeSeenMilestone(vaultId, level);
  // First sighting of a vault: remember it quietly rather than celebrating old progress.
  if (seen === null) return null;
  return level > seen ? level : null;
}

export const MILESTONE_TITLE: Record<number, string> = {
  1: "A quarter of the way",
  2: "Halfway there",
  3: "Three quarters saved",
  4: "Goal reached",
};

/** Watches a vault while its screen is focused and surfaces a milestone crossed since last seen. */
export function useMilestoneWatch(vault: Pick<Vault, "id" | "progress"> | undefined, active: boolean) {
  const [level, setLevel] = useState<number | null>(null);
  const id = vault?.id;
  const progress = vault?.progress;
  useEffect(() => {
    if (!id || progress === undefined || !active) return;
    let alive = true;
    void recordMilestone(id, progress).then((crossed) => {
      if (alive && crossed) setLevel(crossed);
    });
    return () => {
      alive = false;
    };
  }, [id, progress, active]);
  const dismiss = useCallback(() => setLevel(null), []);
  return { level, dismiss };
}
