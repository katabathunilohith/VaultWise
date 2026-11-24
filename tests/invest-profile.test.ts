import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/v1/invest/profile/route";
import { missingAnswers, QUESTIONS } from "@/lib/invest/profile";
import { createUser } from "@/lib/users";

createUser({ name: "Ira Sen", country: "IN", pin: "1357" });

const post = (answers: Record<string, number>) =>
  (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/v1/invest/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers }),
    }),
  );

describe("risk questionnaire", () => {
  it("lists the questions without a valid answer", () => {
    const all = Object.fromEntries(QUESTIONS.map((q) => [q.id, 0]));
    expect(missingAnswers(all)).toEqual([]);
    const withoutFirst = Object.fromEntries(Object.entries(all).filter(([id]) => id !== QUESTIONS[0].id));
    expect(missingAnswers(withoutFirst)).toEqual([QUESTIONS[0].id]);
  });

  it("answers a partial questionnaire with a 400, not a server error", async () => {
    const res = await post({ [QUESTIONS[0].id]: 1 });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "missing_answer" });
  });

  it("still scores a complete questionnaire", async () => {
    const res = await post(Object.fromEntries(QUESTIONS.map((q) => [q.id, 1])));
    expect(res.status).toBe(200);
    expect((await res.json()).profile.score).toBeGreaterThan(0);
  });
});
