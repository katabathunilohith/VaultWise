/**
 * Minimal Groq client (OpenAI-compatible Chat Completions).
 * The key is read from GROQ_API_KEY in .env.local and never leaves the server.
 */

export const VISION_MODEL = process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";
export const TEXT_MODEL = process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-120b";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export type ChatContent = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ChatContent;
}

export function aiEnabled() {
  return !!process.env.GROQ_API_KEY;
}

export class AiUnavailable extends Error {}

/** A failed model call. `message` is safe to show customers; the provider's raw text (which names the org) goes to the server log only. */
export class AiError extends Error {
  constructor(
    message: string,
    public kind: "daily_limit" | "rate_limit" | "bad_output" | "provider",
  ) {
    super(message);
  }
}

function providerError(status: number, text: string) {
  console.warn(`[groq] ${status}: ${text.slice(0, 500)}`);
  if (status === 429 && /per day|\((?:TPD|RPD)\)/i.test(text))
    return new AiError("the AI provider's daily usage limit has been reached", "daily_limit");
  if (status === 429) return new AiError("the AI provider is at capacity right now", "rate_limit");
  if (status === 400 && text.includes("json_validate_failed")) return new AiError("the AI model returned an unreadable answer", "bad_output");
  return new AiError(`the AI provider returned an error (${status})`, "provider");
}

/** One customer-safe line for any failure of a model call. */
export function describeAiError(e: unknown) {
  if (e instanceof AiError) return e.message;
  if (e instanceof AiUnavailable) return "AI isn't configured on this server";
  const name = (e as Error)?.name;
  if (name === "AbortError" || name === "TimeoutError") return "the AI model took too long to respond";
  if (e instanceof SyntaxError) return "the AI model returned an unreadable answer";
  return "the AI step didn't complete";
}

function body(model: string, messages: ChatMessage[], opts: { json?: boolean; temperature?: number; maxTokens?: number; stream?: boolean }) {
  return JSON.stringify({
    model,
    messages,
    temperature: opts.temperature ?? 0.2,
    max_completion_tokens: opts.maxTokens ?? 1200,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    ...(opts.stream ? { stream: true } : {}),
  });
}

/** Seconds to wait before retrying a 429, from the header or the error message. */
function retryDelayMs(res: Response, text: string) {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header * 1000;
  const m = text.match(/try again in (?:(\d+)m)?([\d.]+)s/i);
  if (m) return (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000;
  return 2000;
}

async function call(model: string, messages: ChatMessage[], opts: { json?: boolean; temperature?: number; maxTokens?: number; timeoutMs?: number }) {
  if (!aiEnabled()) throw new AiUnavailable("GROQ_API_KEY is not configured");
  const budget = opts.timeoutMs ?? 30_000;
  const deadline = Date.now() + budget;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), budget);
  try {
    let last = { status: 0, text: "" };
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: body(model, messages, opts),
        signal: ctrl.signal,
      });
      if (res.ok) {
        const data = await res.json();
        const content: string = data.choices?.[0]?.message?.content ?? "";
        return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      }
      const text = await res.text();
      last = { status: res.status, text };
      // 429 = rate limit; 5xx = provider hiccup; 400 json_validate_failed = the model emitted
      // malformed JSON in JSON mode (a sampling fluke) — all worth one more try.
      const retryable = res.status === 429 || res.status >= 500 || (res.status === 400 && text.includes("json_validate_failed"));
      if (!retryable) break;
      // Wait as instructed if the budget allows (per-minute limits clear in seconds; a spent daily quota won't).
      const wait = res.status === 429 ? retryDelayMs(res, text) + 250 : 1000;
      if (Date.now() + wait > deadline - 2000) break;
      await new Promise((r) => setTimeout(r, wait));
    }
    throw providerError(last.status, last.text);
  } finally {
    clearTimeout(timer);
  }
}

export async function chatText(messages: ChatMessage[], opts: { model?: string; temperature?: number; maxTokens?: number } = {}) {
  return call(opts.model ?? TEXT_MODEL, messages, opts);
}

export async function chatJson<T>(
  messages: ChatMessage[],
  opts: { model?: string; temperature?: number; maxTokens?: number; timeoutMs?: number } = {},
): Promise<T> {
  const raw = await call(opts.model ?? TEXT_MODEL, messages, { ...opts, json: true });
  const match = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : raw) as T;
}

/** Streams assistant text deltas from Groq as a ReadableStream of plain text. */
export async function chatStream(messages: ChatMessage[], opts: { model?: string; temperature?: number; maxTokens?: number } = {}) {
  if (!aiEnabled()) throw new AiUnavailable("GROQ_API_KEY is not configured");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: body(opts.model ?? TEXT_MODEL, messages, { ...opts, stream: true }),
  });
  if (!res.ok || !res.body) throw providerError(res.status, await res.text());
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const reader = res.body.getReader();
  return new ReadableStream<Uint8Array>({
    // Keep reading until at least one content delta is enqueued: a pull() that
    // resolves without enqueuing (e.g. reasoning-only chunks) would stall the stream.
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        let pushed = false;
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
            if (delta) {
              controller.enqueue(encoder.encode(delta));
              pushed = true;
            }
          } catch {
            // partial frame; ignore
          }
        }
        if (pushed) return;
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}
