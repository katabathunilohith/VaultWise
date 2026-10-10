import { useEffect, useSyncExternalStore } from "react";
import { caseMessageKey, getItem, KEYS, removeItem, setItem } from "@/lib/storage";
import type { SupportTopic } from "./topics";

/**
 * Support cases, kept on this device. There's no support API yet, so in Practice mode a case
 * is simulated: it gets a real case number, queue position and reply time, but nobody answers.
 *
 * Storage: the list (without messages) lives under "vw.cases"; each message under its own key.
 * Native storage is the Keychain/Keystore, which can reject large values, so nothing here grows
 * past a couple of kilobytes.
 */
export type ActivityAttachment = "off" | "unavailable" | number;

export interface SupportCase {
  id: string;
  topic: SupportTopic;
  ref?: string;
  message: string;
  createdAt: number;
  /** Exact time a reply is due: four hours after the case was opened. */
  replyBy: number;
  /** Place in the queue when the case was opened. */
  queue: number;
  attached: ActivityAttachment;
}

export const MAX_OPEN_CASES = 5;
export const MESSAGE_MAX = 600;
export const REPLY_WINDOW_MS = 4 * 60 * 60 * 1000;

const TOPIC_KEYS: SupportTopic[] = ["held", "proof", "emergency", "payment", "other"];

let cache: SupportCase[] | null = null;
let loading: Promise<SupportCase[]> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

type CaseMeta = Omit<SupportCase, "message">;

function isMeta(x: unknown): x is CaseMeta {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.createdAt === "number" &&
    typeof o.replyBy === "number" &&
    typeof o.queue === "number" &&
    TOPIC_KEYS.includes(o.topic as SupportTopic) &&
    (o.attached === "off" || o.attached === "unavailable" || typeof o.attached === "number")
  );
}

function load(): Promise<SupportCase[]> {
  if (cache) return Promise.resolve(cache);
  loading ??= (async () => {
    let metas: CaseMeta[] = [];
    try {
      const parsed: unknown = JSON.parse((await getItem(KEYS.cases)) ?? "[]");
      metas = Array.isArray(parsed) ? parsed.filter(isMeta) : [];
    } catch {
      metas = [];
    }
    const withMessages = await Promise.all(metas.map(async (m) => ({ ...m, message: (await getItem(caseMessageKey(m.id))) ?? "" })));
    // A case added while we were reading wins over what was on disk.
    cache = cache ?? withMessages;
    emit();
    return cache;
  })();
  return loading;
}

async function persist() {
  const metas: CaseMeta[] = (cache ?? []).map(({ message: _message, ...meta }) => meta);
  await setItem(KEYS.cases, JSON.stringify(metas));
}

function newCaseId(taken: Set<string>) {
  for (;;) {
    const id = `VW-${Math.floor(10000 + Math.random() * 90000)}`;
    if (!taken.has(id)) return id;
  }
}

export async function addCase(input: { topic: SupportTopic; ref?: string; message: string; attached: ActivityAttachment }): Promise<SupportCase> {
  const existing = await load();
  const now = Date.now();
  const created: SupportCase = {
    id: newCaseId(new Set(existing.map((c) => c.id))),
    topic: input.topic,
    ref: input.ref,
    message: input.message.trim().slice(0, MESSAGE_MAX),
    createdAt: now,
    replyBy: now + REPLY_WINDOW_MS,
    queue: 2 + Math.floor(Math.random() * 4),
    attached: input.attached,
  };
  cache = [created, ...existing];
  emit();
  await Promise.all([setItem(caseMessageKey(created.id), created.message), persist()]);
  return created;
}

export async function closeCase(id: string) {
  const existing = await load();
  cache = existing.filter((c) => c.id !== id);
  emit();
  await Promise.all([removeItem(caseMessageKey(id)), persist()]);
}

/**
 * Drops the cases held in memory, after Delete account has cleared them from storage. Without
 * this, Support keeps showing them and the next new case would write them back.
 */
export function forgetCases() {
  cache = [];
  loading = null;
  emit();
}

/** Open cases, newest first. `null` while they're being read from storage. */
export function useCases(): SupportCase[] | null {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => cache,
    () => cache,
  );
}

export type CaseStage = "queued" | "withPerson" | "overdue";

/**
 * Where a case is now. Simulated: the queue moves up evenly over the first half of the reply
 * window, then the case is "with a person". Practice mode never gets a reply, and says so.
 */
export function caseStatus(c: SupportCase, now: number): { stage: CaseStage; position: number } {
  if (now >= c.replyBy) return { stage: "overdue", position: 0 };
  const perPlace = (c.replyBy - c.createdAt) / 2 / Math.max(1, c.queue);
  const position = Math.max(0, c.queue - Math.floor((now - c.createdAt) / perPlace));
  return { stage: position > 0 ? "queued" : "withPerson", position };
}
