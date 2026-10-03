import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { run } from "@/lib/db";
import { audit } from "@/lib/audit";
import { riskProfile } from "@/lib/invest/core";
import { BANDS, modelPortfolio, QUESTIONS, scoreAnswers } from "@/lib/invest/profile";

export const GET = handle(async () => {
  const user = await customer({ tick: false });
  const profile = riskProfile(user);
  return json({ questions: QUESTIONS, bands: BANDS, profile, portfolio: profile ? modelPortfolio(user.jurisdiction, profile.band) : null });
});

export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ answers: z.record(z.string(), z.number().int().min(0).max(3)) }));
  const scored = scoreAnswers(b.answers);
  const profile = { ...scored, completedAt: Date.now() };
  run("UPDATE users SET risk_profile = ? WHERE id = ?", JSON.stringify(profile), user.id);
  audit({
    userId: user.id,
    actor: user.id,
    actorType: "user",
    action: "invest.risk_profiled",
    entityType: "user",
    entityId: user.id,
    details: { score: scored.score, band: scored.band },
  });
  return json({ profile, portfolio: modelPortfolio(user.jurisdiction, scored.band) });
});
