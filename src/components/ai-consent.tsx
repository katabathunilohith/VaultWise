"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Bot, UserRound } from "lucide-react";
import { Button, Modal } from "./ui";

/**
 * ai-consent (web): the person's answer to "Can an AI read what you send?", the web twin of the phone's
 * sheet (mobile/src/features/ai-consent). Plan 05: the server treats a missing `x-ai-consent` header as no.
 *
 * - The answer is kept in this browser's localStorage under `vw-ai-consent` ("yes" or "no").
 * - src/lib/client.ts sends `x-ai-consent: yes | no` on every request, from `aiConsentHeaderValue()`:
 *   "yes" only after a yes, so an unanswered question counts as no.
 * - `askAiConsent(reason)` is awaited before the first bill or receipt upload, ID photo, limit request and
 *   assistant message; it resolves at once once answered. `<AiConsentHost />` (in src/app/layout.tsx) shows it.
 * - `<AiConsentSwitch />` lets the person change the answer later (the assistant page shows it).
 *
 * Remove: delete this file, its host in layout.tsx and the calls marked `// ai-consent`; the server then
 * treats every web request as a no.
 */

export type AiAnswer = "yes" | "no";
/** What the person is about to send, for the first line of the question. */
export type AiReason = "bill" | "id" | "limits" | "assistant";

export const AI_CONSENT_STORAGE_KEY = "vw-ai-consent";

const listeners = new Set<() => void>();
let answer: AiAnswer | null | undefined; // undefined: not read from storage yet
let pending: { reason: AiReason; resolve: (a: AiAnswer | null) => void } | null = null;

function emit() {
  for (const l of listeners) l();
}

function readStored(): AiAnswer | null {
  try {
    const v = localStorage.getItem(AI_CONSENT_STORAGE_KEY);
    return v === "yes" || v === "no" ? v : null;
  } catch {
    return null;
  }
}

/** The stored answer, or null when the person hasn't answered (or this is the server render). */
export function aiConsentAnswer(): AiAnswer | null {
  if (typeof window === "undefined") return null;
  if (answer === undefined) answer = readStored();
  return answer;
}

/** The value for the `x-ai-consent` header: "yes" only after a yes. */
export function aiConsentHeaderValue(): AiAnswer {
  return aiConsentAnswer() === "yes" ? "yes" : "no";
}

/** Saves the answer in this browser (null forgets it, so the question comes back). */
export function setAiConsent(next: AiAnswer | null) {
  answer = next;
  try {
    if (next) localStorage.setItem(AI_CONSENT_STORAGE_KEY, next);
    else localStorage.removeItem(AI_CONSENT_STORAGE_KEY);
  } catch {
    // Storage blocked: the answer holds for this tab only.
  }
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Another tab changed the answer.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== AI_CONSENT_STORAGE_KEY && e.key !== null) return;
    answer = readStored();
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAiConsent(): AiAnswer | null {
  return useSyncExternalStore(subscribe, aiConsentAnswer, () => null);
}

/**
 * The person's answer, asking first if they haven't given one (or always, with `again`).
 * Resolves with "yes" or "no", or null if they closed the question without answering (then don't send).
 */
export function askAiConsent(reason: AiReason, opts: { again?: boolean } = {}): Promise<AiAnswer | null> {
  const known = aiConsentAnswer();
  if (known && !opts.again) return Promise.resolve(known);
  return new Promise((resolve) => {
    pending?.resolve(null);
    pending = { reason, resolve };
    emit();
  });
}

function finish(a: AiAnswer | null) {
  const p = pending;
  if (!p) return;
  pending = null;
  if (a) setAiConsent(a);
  else emit();
  p.resolve(a ?? null);
}

const LEAD: Record<AiReason, string> = {
  bill: "Before your bill is sent:",
  id: "Before your ID photo is sent:",
  limits: "Before your request is checked:",
  assistant: "Before you chat with the assistant:",
};

/** Shows the question whenever `askAiConsent()` is waiting. Mounted once, in the root layout. */
export function AiConsentHost() {
  const p = useSyncExternalStore(
    subscribe,
    () => pending,
    () => null,
  );
  return (
    <Modal
      open={!!p}
      onClose={() => finish(null)}
      title="Can an AI read what you send?"
      footer={
        <>
          <Button variant="secondary" onClick={() => finish("no")} icon={<UserRound className="size-4" aria-hidden />}>
            No, a person reads it
          </Button>
          <Button onClick={() => finish("yes")} icon={<Bot className="size-4" aria-hidden />}>
            Yes, use AI
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm leading-relaxed text-ink-2">
        {p && <p className="font-medium text-ink">{LEAD[p.reason]}</p>}
        <p>
          Vaultwise can send your bills, receipts and ID photos, the reason you give for a limit request, and your assistant chats to an AI
          service (Groq) to read and check them. It only gets what that one check needs. The AI never decides alone: anything unclear goes to a
          person.
        </p>
        <p>
          <strong className="text-ink">If you say no,</strong> a person reads your bills and IDs instead (usually within a day), limit requests
          and tips use fixed rules, and the assistant stays off.
        </p>
        <p className="text-[13px] text-muted">
          You can change this any time on the Assistant page. Details are in our{" "}
          <Link href="/privacy" className="font-medium text-accent-ink hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </Modal>
  );
}

/** The current answer with a way to change it, for the assistant page (and Settings, if wanted). */
export function AiConsentSwitch({ reason = "assistant" }: { reason?: AiReason }) {
  const a = useAiConsent();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
      <span>
        AI reading:{" "}
        <strong className="font-medium text-ink">{a === "yes" ? "on" : a === "no" ? "off, a person reads instead" : "not asked yet"}</strong>
      </span>
      <button type="button" onClick={() => askAiConsent(reason, { again: true })} className="font-medium text-accent-ink hover:underline">
        {a ? "Change" : "Choose"}
      </button>
    </div>
  );
}
