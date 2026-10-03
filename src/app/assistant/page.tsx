"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, Send, Sparkles, User } from "lucide-react";
import { useMe } from "@/components/shell";
import { Button, Card, Notice, PageHeader, cx } from "@/components/ui";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Am I on track for my Health vault goal?",
  "How does Tier 2 emergency access work?",
  "Why was my coffee receipt declined?",
  "What's a fair value gap, and why is the Satellite sleeve capped?",
  "How can I save more without feeling it?",
];

/** Minimal, safe markdown: paragraphs, bullets, numbered lists and **bold** — rendered as React nodes. */
function Markdown({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      ) : part.startsWith("`") && part.endsWith("`") ? (
        <code key={i} className="rounded bg-sunken px-1 font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      ) : (
        part
      ),
    );
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list;
    blocks.push(
      L.ordered ? (
        <ol key={blocks.length} className="list-decimal space-y-1 pl-5">
          {L.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ol>
      ) : (
        <ul key={blocks.length} className="list-disc space-y-1 pl-5">
          {L.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ul>
      ),
    );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const b = line.match(/^\s*[-*•]\s+(.*)/);
    const n = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (b || n) {
      const ordered = !!n;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((b ?? n)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^#{1,4}\s+(.*)/);
    blocks.push(
      h ? (
        <p key={blocks.length} className="font-semibold text-ink">
          {inline(h[1])}
        </p>
      ) : (
        <p key={blocks.length}>{inline(line)}</p>
      ),
    );
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

export default function AssistantPage() {
  const { user, aiEnabled } = useMe();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/v1/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-12) }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "The assistant is unavailable." }));
        throw new Error(err.error);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs([...next, { role: "assistant", content: acc }]);
      }
      if (!acc) setMsgs([...next, { role: "assistant", content: "I couldn't generate a reply just now — please try again." }]);
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: `⚠︎ ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vw-in flex h-[calc(100vh-7rem)] flex-col lg:h-[calc(100vh-4.5rem)]">
      <PageHeader
        title="Assistant"
        subtitle="Ask about your vaults, verification, emergency access or investing concepts. Educational only — not financial advice."
      />
      {!aiEnabled && <Notice tone="warn">Add GROQ_API_KEY to .env.local to enable the assistant.</Notice>}
      <Card className="flex min-h-0 flex-1 flex-col" pad={false}>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {msgs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <Sparkles className="size-6" />
              </div>
              <div className="mt-3 text-base font-semibold">Hi {user.name.split(" ")[0]}, what can I help with?</div>
              <p className="mt-1 max-w-md text-[13px] text-muted">
                I can see your vault balances and goals, and explain how every part of the app works.
              </p>
              <div className="mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-line px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-accent hover:text-accent-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {msgs.map((m, i) => (
                <div key={i} className={cx("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                  <span
                    className={cx(
                      "flex size-8 shrink-0 items-center justify-center rounded-full",
                      m.role === "user" ? "bg-accent text-white" : "bg-sunken text-ink-2",
                    )}
                  >
                    {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
                  </span>
                  <div
                    className={cx(
                      "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      m.role === "user" ? "bg-accent text-white" : "bg-surface-2 text-ink-2",
                    )}
                  >
                    {m.role === "assistant" ? (
                      m.content ? (
                        <Markdown text={m.content} />
                      ) : (
                        <span className="vw-pulse text-muted">Thinking…</span>
                      )
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              ))}
              <div ref={end} />
            </div>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2 border-t border-line p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your savings…"
            className="h-11 flex-1 rounded-xl border border-line-strong bg-surface px-4 text-sm focus:border-accent focus:outline-none"
            aria-label="Message"
          />
          <Button type="submit" size="lg" disabled={!input.trim()} loading={busy} icon={<Send className="size-4" />} className="h-11">
            Send
          </Button>
        </form>
      </Card>
    </div>
  );
}
