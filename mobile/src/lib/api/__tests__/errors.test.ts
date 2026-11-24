import { ApiError, errorMessage, isRecoveryHold, mayHaveGoneThrough } from "../errors";

describe("mayHaveGoneThrough", () => {
  it("is true only when no answer came back: a timeout or dropped connection (status 0) or a 504", () => {
    expect(mayHaveGoneThrough(new ApiError("Vaultwise took too long to answer. Try again.", 0))).toBe(true);
    expect(mayHaveGoneThrough(new ApiError("Gateway timeout", 504))).toBe(true);
  });

  it("is false for any answer, even a server error", () => {
    for (const status of [400, 401, 403, 409, 422, 423, 500, 502, 503]) expect(mayHaveGoneThrough(new ApiError("x", status))).toBe(false);
  });

  it("is false for anything that isn't an ApiError", () => {
    expect(mayHaveGoneThrough(new TypeError("Network request failed"))).toBe(false);
    expect(mayHaveGoneThrough({ status: 0 })).toBe(false);
    expect(mayHaveGoneThrough(null)).toBe(false);
  });
});

describe("errorMessage", () => {
  it("says a known code the same way every time, whatever the server wrote", () => {
    expect(errorMessage(new ApiError("Forbidden", 403, "kyc_required"))).toBe(
      "Verify your ID to move money. It's in Profile & settings, under Identity verification.",
    );
  });

  it("rewrites internal wording into plain words", () => {
    expect(errorMessage(new ApiError("Insufficient funds in Linked bank account", 400))).toBe("There isn't enough money there for this.");
    expect(errorMessage(new ApiError("Request failed (503)", 503))).toBe("Something went wrong on our side. Try again in a moment.");
  });

  it("falls back for errors without words, and keeps customer-safe ones", () => {
    expect(errorMessage(new Error(""))).toBe("Something went wrong. Try again.");
    expect(errorMessage(undefined, "Nope")).toBe("Nope");
    expect(errorMessage(new ApiError("That vault is closed.", 400))).toBe("That vault is closed.");
  });

  it("says a sign-in request plainly when this app has no sign-in set up", () => {
    expect(errorMessage(new ApiError("Signed out", 401, "signed_out"))).toBe("This server needs sign-in, which this app isn't set up for.");
  });
});

describe("isRecoveryHold", () => {
  it("knows the recovery hold by its code", () => {
    expect(isRecoveryHold(new ApiError("x", 403, "recovery_restricted"))).toBe(true);
    expect(isRecoveryHold(new ApiError("x", 403, "kyc_required"))).toBe(false);
  });
});
