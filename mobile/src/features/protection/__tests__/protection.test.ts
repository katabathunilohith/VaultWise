import { SENSITIVE_ROUTES } from "../config";
import { allowedServerAddress } from "../https";
import { PIN_TRIES_BEFORE_WAIT, PIN_TRIES_FINAL, pinTriesExhausted, pinTriesLeft, pinWaitAfter } from "../pin-policy";
import { isSensitiveRoute, routePath } from "../routes";

describe("the wrong-PIN guard (pin-policy.ts)", () => {
  it("lets 4 wrong tries through, then waits 1, 5, 30 and 60 minutes, and 60 after that", () => {
    expect(PIN_TRIES_BEFORE_WAIT).toBe(5);
    expect([0, 1, 2, 3, 4].map(pinWaitAfter)).toEqual([null, null, null, null, null]);
    expect(pinWaitAfter(5)).toBe(60_000);
    expect(pinWaitAfter(6)).toBe(5 * 60_000);
    expect(pinWaitAfter(7)).toBe(30 * 60_000);
    expect(pinWaitAfter(8)).toBe(60 * 60_000);
    expect(pinWaitAfter(9)).toBe(60 * 60_000);
    expect(pinWaitAfter(25)).toBe(60 * 60_000);
  });

  it("ends it on the 10th wrong try in a row", () => {
    expect(PIN_TRIES_FINAL).toBe(10);
    expect(pinTriesExhausted(9)).toBe(false);
    expect(pinTriesExhausted(10)).toBe(true);
    expect(pinTriesExhausted(12)).toBe(true);
  });

  it("counts tries left before the first wait, then before the end", () => {
    expect(pinTriesLeft(0)).toBe(5);
    expect(pinTriesLeft(4)).toBe(1);
    expect(pinTriesLeft(5)).toBe(5);
    expect(pinTriesLeft(9)).toBe(1);
    expect(pinTriesLeft(10)).toBe(0);
    expect(pinTriesLeft(14)).toBe(0);
  });
});

describe("screenshot blocking (routes.ts)", () => {
  it("drops route groups from the path", () => {
    expect(routePath(["(tabs)", "emergency"])).toBe("emergency");
    expect(routePath(["wallet", "[action]"])).toBe("wallet/[action]");
    expect(routePath(["(app)", "(tabs)", "settings", "security"])).toBe("settings/security");
  });

  it("matches a sensitive route and the routes under it, not ones that only start the same", () => {
    expect(isSensitiveRoute(["mpin"])).toBe(true);
    expect(isSensitiveRoute(["(app)", "withdraw", "choose"])).toBe(true);
    expect(isSensitiveRoute(["settings", "security"])).toBe(true);
    expect(isSensitiveRoute(["wallet", "[action]"])).toBe(true);
    expect(isSensitiveRoute(["wallet"])).toBe(false);
    expect(isSensitiveRoute(["withdrawals"])).toBe(false);
    expect(isSensitiveRoute(["(tabs)", "emergency"])).toBe(false);
    expect(isSensitiveRoute(["settings"])).toBe(false);
  });

  it("covers every PIN pad and money-out route on the list", () => {
    for (const r of ["unlock", "checkout", "settings/reset-mpin", "settings/trust-device", "verify-id"]) expect(SENSITIVE_ROUTES).toContain(r);
  });

  it("takes its own list", () => {
    expect(isSensitiveRoute(["a", "b"], ["a"])).toBe(true);
    expect(isSensitiveRoute(["a", "b"], ["b"])).toBe(false);
  });
});

describe("server addresses (https.ts)", () => {
  it("needs https:// in a live build", () => {
    expect(allowedServerAddress("https://vaultwise.example.com", false)).toEqual({ ok: true });
    expect(allowedServerAddress("http://192.168.1.20:3000", false)).toMatchObject({ ok: false, message: expect.stringMatching(/https:\/\//) });
    expect(allowedServerAddress("vaultwise.example.com", false)).toEqual({ ok: false, message: "Start the address with https://" });
  });

  it("also takes http:// in a development build", () => {
    expect(allowedServerAddress("http://192.168.1.20:3000", true)).toEqual({ ok: true });
    expect(allowedServerAddress("ftp://x", true)).toEqual({ ok: false, message: "Start the address with http:// or https://" });
    expect(allowedServerAddress("https:// spaced", true)).toMatchObject({ ok: false });
  });
});
