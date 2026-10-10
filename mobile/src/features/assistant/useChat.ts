import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { Vault } from "@/lib/api/types";
import { haptic } from "@/lib/haptics";
import { detectMoneyAction, guessTopic, urgentTopic, type MoneyAction } from "./intents";
import type { SupportTopic } from "./support/topics";
import { effectiveTone, stripEmoji, withStyle, type Tone } from "./tone";

export interface UserMessage {
  id: string;
  role: "user";
  text: string;
}

export interface AssistantMessage {
  id: string;
  role: "assistant";
  text: string;
  status: "streaming" | "done" | "error";
  error?: string;
  /** The tone actually used for this reply. */
  tone: Tone;
  /** True when the dial said Hype/Roast but the topic needed a straight answer. */
  fellBack: boolean;
  /** Set when the person asked the assistant to move money. */
  action: MoneyAction | null;
  reported: boolean;
}

export type ChatMessage = UserMessage | AssistantMessage;

/** The server accepts up to 30 messages of up to 4,000 characters. */
const HISTORY = 20;
const CONTENT_MAX = 4000;
/** No text for this long means the reply has stalled; it becomes a retryable error. */
const STALL_MS = 30_000;

// The conversation survives closing and reopening the assistant (in memory only, never on disk)
// until "New chat" or an app restart.
let saved: ChatMessage[] = [];

function restore(): ChatMessage[] {
  return saved.map((m) =>
    m.role === "assistant" && m.status === "streaming"
      ? { ...m, status: "error", error: m.text ? "This reply stopped when the chat closed." : "This reply didn't finish." }
      : m,
  );
}

let seq = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

function friendlyError(e: unknown) {
  if (e instanceof ApiError) {
    if (e.status === 0) return e.message;
    if (e.status === 503) return "The assistant is switched off right now. A person can still help.";
    if (e.status === 408) return "The assistant took too long to answer. Try again.";
    if (e.status === 429) return "The assistant is busy. Try again in a minute.";
    return "The assistant couldn't answer just now. Try again.";
  }
  return "Can't reach Vaultwise. Check your connection.";
}

/** What goes to the API: finished turns only, the newest user message carrying the tone hint. */
function toPayload(convo: ChatMessage[], tone: Tone) {
  const turns = convo.filter((m) => m.role === "user" || (m.status === "done" && m.text.trim()));
  const out = turns.map((m, i) => ({
    role: m.role,
    content: (i === turns.length - 1 && m.role === "user" ? withStyle(m.text, tone) : m.text).slice(0, CONTENT_MAX),
  }));
  const recent = out.slice(-HISTORY);
  while (recent.length > 1 && recent[0].role === "assistant") recent.shift();
  return recent;
}

const lastUserText = (ms: ChatMessage[]) => {
  for (let i = ms.length - 1; i >= 0; i--) {
    const m = ms[i];
    if (m.role === "user") return m.text;
  }
  return "";
};

/**
 * The assistant conversation: sending, streaming into the last bubble (no haptics while it
 * streams), retrying, and the derived "talk to a person" state.
 */
export function useChat(vaults: Vault[] | undefined, enabled: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => (enabled ? restore() : []));
  /** Bumped on every new request, "New chat" and unmount; stale streams check it and stop. */
  const run = useRef(0);

  // Consent withdrawn (in Settings): start over, so nothing from before is sent again.
  useEffect(() => {
    if (enabled) return;
    run.current++;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consent is withdrawn in Settings (outside this screen); clear the chat once
    setMessages((ms) => (ms.length ? [] : ms));
  }, [enabled]);

  useEffect(() => {
    saved = messages;
  }, [messages]);

  useEffect(() => {
    const runs = run;
    return () => {
      runs.current++;
    };
  }, []);

  const patch = (id: string, change: Partial<AssistantMessage>) =>
    setMessages((ms) => ms.map((m) => (m.id === id && m.role === "assistant" ? { ...m, ...change } : m)));

  async function stream(replyId: string, convo: ChatMessage[], tone: Tone) {
    const mine = ++run.current;
    let text = "";
    // The live request has no timeout of its own, so a stalled stream would block the composer
    // for good. A watchdog, reset by every chunk, turns silence into a retryable error.
    let over = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stalled: (e: ApiError) => void = () => {};
    const watchdog = new Promise<never>((_, reject) => {
      stalled = reject;
    });
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => stalled(new ApiError("The assistant took too long to answer.", 408)), STALL_MS);
    };
    arm();
    try {
      await Promise.race([
        api.assistant(toPayload(convo, tone), (delta) => {
          if (over || run.current !== mine) return;
          arm();
          text += delta;
          patch(replyId, { text });
        }),
        watchdog,
      ]);
      if (run.current !== mine) return;
      if (!text.trim()) throw new ApiError("The assistant sent an empty reply.", 500);
      patch(replyId, { status: "done" });
      AccessibilityInfo.announceForAccessibility(tone === "straight" ? stripEmoji(text) : text);
    } catch (e) {
      if (run.current !== mine) return;
      haptic("error");
      patch(replyId, { status: "error", error: friendlyError(e) });
    } finally {
      over = true;
      clearTimeout(timer);
    }
  }

  const streaming = messages.some((m) => m.role === "assistant" && m.status === "streaming");

  function send(raw: string, chosen: Tone) {
    const text = raw.trim();
    if (!text || streaming || !enabled) return;
    const { tone, fellBack } = effectiveTone(chosen, text, lastUserText(messages));
    const question: UserMessage = { id: newId("u"), role: "user", text };
    const reply: AssistantMessage = {
      id: newId("a"),
      role: "assistant",
      text: "",
      status: "streaming",
      tone,
      fellBack,
      action: detectMoneyAction(text, vaults),
      reported: false,
    };
    const convo = [...messages, question];
    setMessages([...convo, reply]);
    void stream(reply.id, convo, tone);
  }

  function retry(replyId: string) {
    if (streaming || !enabled) return;
    const i = messages.findIndex((m) => m.id === replyId);
    const reply = messages[i];
    if (i < 0 || reply.role !== "assistant") return;
    patch(replyId, { status: "streaming", text: "", error: undefined });
    void stream(replyId, messages.slice(0, i), reply.tone);
  }

  function reset() {
    run.current++;
    setMessages([]);
  }

  function markReported(replyId: string) {
    patch(replyId, { reported: true });
  }

  // "Talk to a person": after two answers, or straight away for missing money, fraud, locked
  // money or emergencies.
  const userTexts = messages.filter((m): m is UserMessage => m.role === "user").map((m) => m.text);
  const answered = messages.filter((m) => m.role === "assistant" && m.status === "done").length;
  const urgent = userTexts.map(urgentTopic).find((t): t is SupportTopic => !!t) ?? null;
  const person = {
    visible: answered >= 2 || !!urgent,
    topic: urgent ?? guessTopic(userTexts.join("\n")),
    question: userTexts[userTexts.length - 1],
  };

  return { messages, streaming, send, retry, reset, markReported, person };
}
