import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "@/lib/db";
import { AiError, chatJson, describeAiError } from "@/lib/groq";
import { requestEmergencyLimitChange } from "@/lib/limits";
import { createUser, type User } from "@/lib/users";

const DAILY =
  "Rate limit reached for model `qwen/qwen3.8-27b` in organization `org_01testorgid` service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 200000, Requested 2074. Please try again in 14m55.968s.";

function groqReplies(...replies: { status: number; message: string; retryAfter?: string }[]) {
  const fetchMock = vi.fn(async () => {
    const r = replies.length > 1 ? replies.shift()! : replies[0];
    return new Response(JSON.stringify({ error: { message: r.message } }), {
      status: r.status,
      headers: r.retryAfter ? { "retry-after": r.retryAfter } : {},
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  process.env.GROQ_API_KEY = "test-key";
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.GROQ_API_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Groq failures", () => {
  it("gives up at once on a spent daily quota and never exposes the provider's text", async () => {
    const fetchMock = groqReplies({ status: 429, message: DAILY, retryAfter: "896" });
    const err = (await chatJson([{ role: "user", content: "hi" }]).catch((e) => e)) as AiError;
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe("daily_limit");
    expect(err.message).not.toMatch(/org_|qwen|TPD/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("waits out a per-minute limit and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "tokens per minute (TPM). Please try again in 0.1s." } }), { status: 429 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(chatJson([{ role: "user", content: "hi" }])).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("describes every failure in plain words", async () => {
    groqReplies({ status: 401, message: "Invalid API Key for org_01testorgid" });
    const err = (await chatJson([{ role: "user", content: "hi" }]).catch((e) => e)) as AiError;
    expect(describeAiError(err)).toBe("the AI provider returned an error (401)");
    expect(describeAiError(Object.assign(new Error("aborted"), { name: "AbortError" }))).toMatch(/took too long/);
    expect(describeAiError(new SyntaxError("Unexpected token"))).toMatch(/unreadable/);
    expect(describeAiError(new TypeError("fetch failed"))).toBe("the AI step didn't complete");
  });

  it("an emergency limit request still gets a decision, with a clean reason, when the AI is out of quota", async () => {
    groqReplies({ status: 429, message: DAILY, retryAfter: "896" });
    const u = createUser({ name: "Quota Test", country: "US", pin: "1357" });
    const r = await requestEmergencyLimitChange(get<User>("SELECT * FROM users WHERE id = ?", u.id)!, {
      limits: { singleWithdrawal: 9_000_00 },
      reasonCode: "medical",
      explanation: "My son needs surgery on Friday and the hospital deposit is $8,500.",
    });
    expect(r.decision).toBe("in_review");
    const row = get<{ assessment: string }>("SELECT assessment FROM limit_changes WHERE id = ?", r.id)!;
    expect(JSON.parse(row.assessment).aiError).toBe("the AI provider's daily usage limit has been reached");
    expect(row.assessment).not.toMatch(/org_/);
  });
});
