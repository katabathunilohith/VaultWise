import { useSyncExternalStore } from "react";
import * as Crypto from "expo-crypto";
import { getItem, onDeviceReset, setItem } from "@/lib/storage";

/** What this phone remembers about the test. Kept apart from Practice data, which resets on reload. */
const KEY = "vw.tester";

export type TaskId = "vault" | "withdraw" | "emergency";

export interface TesterState {
  ready: boolean;
  /** "Can we record what you do?" null until answered. */
  sharing: boolean | null;
  /** Random, and only ever used for this test. */
  id: string;
  done: TaskId[];
  feedbackSent: boolean;
}

const fresh = (): TesterState => ({ ready: true, sharing: null, id: Crypto.randomUUID(), done: [], feedbackSent: false });

let state: TesterState = { ...fresh(), ready: false };
const listeners = new Set<() => void>();

function publish() {
  listeners.forEach((fn) => fn());
}

function save(next: Partial<TesterState>) {
  state = { ...state, ...next };
  publish();
  void setItem(KEY, JSON.stringify({ sharing: state.sharing, id: state.id, done: state.done, feedbackSent: state.feedbackSent }));
}

export const getTester = () => state;

export function useTester() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => state,
  );
}

export async function loadTester() {
  let saved: Partial<TesterState> = {};
  try {
    saved = JSON.parse((await getItem(KEY)) ?? "{}");
  } catch {
    saved = {};
  }
  state = { ...fresh(), ...saved, ready: true };
  publish();
}

export const setSharing = (sharing: boolean) => save({ sharing });
export const markFeedbackSent = () => save({ feedbackSent: true });

export function markTaskDone(task: TaskId) {
  if (!state.done.includes(task)) save({ done: [...state.done, task] });
}

// Delete account: nothing about the test stays on the phone.
onDeviceReset(() => {
  state = fresh();
  publish();
});
