import { describe, expect, it } from "vitest";
import { get } from "@/lib/db";
import { raiseFlag, resolveFlag } from "@/lib/fraud";
import { createUser, type HttpError } from "@/lib/users";

const u = createUser({ name: "Jun Park", jurisdiction: "US", pin: "1357" });

function caught(fn: () => unknown): HttpError | undefined {
  try {
    fn();
  } catch (e) {
    return e as HttpError;
  }
  return undefined;
}

describe("resolving fraud flags", () => {
  it("closes an open flag once and records whose flag it was", () => {
    const id = raiseFlag({ userId: u.id, source: "emergency", severity: "medium", score: 60, description: "Test flag" });
    resolveFlag(id, "dismissed", "Checked with the customer", "reviewer@test");
    expect(get<{ status: string }>("SELECT status FROM fraud_flags WHERE id = ?", id)?.status).toBe("dismissed");
    const audited = get<{ user_id: string | null }>("SELECT user_id FROM audit_log WHERE action = 'fraud.flag_dismissed' AND entity_id = ?", id);
    expect(audited?.user_id).toBe(u.id);
  });

  it("refuses to close a flag twice, so a decision is never overwritten", () => {
    const id = raiseFlag({ userId: u.id, source: "emergency", severity: "low", score: 20, description: "Another flag" });
    resolveFlag(id, "resolved", "Receipt arrived", "reviewer@test");
    const err = caught(() => resolveFlag(id, "dismissed", "Second try", "reviewer@test"));
    expect(err).toMatchObject({ status: 409, code: "flag_closed" });
    expect(get<{ status: string; resolution: string }>("SELECT status, resolution FROM fraud_flags WHERE id = ?", id)).toMatchObject({
      status: "resolved",
      resolution: "Receipt arrived",
    });
  });

  it("refuses an unknown flag", () => {
    expect(caught(() => resolveFlag("flg_missing", "resolved", "x", "reviewer@test"))).toMatchObject({ status: 404, code: "flag_not_found" });
  });
});
