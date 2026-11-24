import { describe, expect, it } from "vitest";
import { limitParam } from "@/lib/api";
import type { HttpError } from "@/lib/users";

const url = (query: string) => new URL(`http://localhost/api/v1/activity${query}`);

describe("?limit= query values", () => {
  it("uses the fallback when the value is missing or empty", () => {
    expect(limitParam(url(""), 200, 500)).toBe(200);
    expect(limitParam(url("?limit="), 200, 500)).toBe(200);
  });

  it("accepts whole numbers and caps them", () => {
    expect(limitParam(url("?limit=50"), 200, 500)).toBe(50);
    expect(limitParam(url("?limit=9999"), 200, 500)).toBe(500);
  });

  it("refuses anything else with a 400 instead of passing NaN to the database", () => {
    for (const bad of ["abc", "0", "-3", "2.5"]) {
      let err: HttpError | undefined;
      try {
        limitParam(url(`?limit=${bad}`), 200, 500);
      } catch (e) {
        err = e as HttpError;
      }
      expect(err, bad).toMatchObject({ status: 400, code: "bad_limit" });
    }
  });
});
