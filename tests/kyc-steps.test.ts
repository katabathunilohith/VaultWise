import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { all, get, run } from "@/lib/db";
import { createUser, type User } from "@/lib/users";
import { idHash } from "@/lib/kyc/secret";
import { assertNameChangeAllowed, decideKyc, kycQueue, kycView } from "@/lib/kyc/service";
import {
  finishBank,
  finishDigiLocker,
  setCheckProviders,
  startBank,
  startDigiLocker,
  submitPan,
  TEST_PAN_MATCH,
  TEST_PAN_MISMATCH,
  type BankVerifier,
  type DigiLockerClient,
  type PanVerifier,
} from "@/lib/kyc/checks";
import { isSetuSandbox, lastDigits, setuBank, setuBaseUrl, setuDigiLocker, setuPan, setuTime, yearOf } from "@/lib/kyc/checks/providers/setu";
import { linkedBankAccount } from "@/lib/bank";
import { productionStartupWarnings } from "@/lib/auth/config";
import { digilockerErrorText } from "@/components/identity/kyc-steps";
import { GET as getKyc } from "@/app/api/v1/kyc/route";
import { POST as postPan } from "@/app/api/v1/kyc/pan/route";
import { POST as postDlStart } from "@/app/api/v1/kyc/digilocker/start/route";
import { POST as postDlFinish } from "@/app/api/v1/kyc/digilocker/finish/route";
import { POST as postBankStart } from "@/app/api/v1/kyc/bank/start/route";
import { POST as postBankFinish } from "@/app/api/v1/kyc/bank/finish/route";

type Route = (r: Request) => Promise<Response>;
const call = async (route: unknown, path: string, payload?: unknown) => {
  const init: RequestInit = { method: payload === undefined && path.endsWith("/kyc") ? "GET" : "POST" };
  if (payload !== undefined) {
    init.body = JSON.stringify(payload);
    init.headers = { "content-type": "application/json" };
  }
  const res = await (route as Route)(new Request(`http://localhost:3000/api/v1${path}`, init));
  return { status: res.status, body: await res.json() };
};

const env = process.env as Record<string, string | undefined>;
const ORIGIN = "http://localhost:3000";

let first: () => User;
function user(name: string, country = "IN") {
  const u = createUser({ name, country, pin: "1234", kycStatus: "pending" });
  return () => get<User>("SELECT * FROM users WHERE id = ?", u.id)!;
}

beforeAll(() => {
  // The prototype-mode customer is the oldest user, so the route tests act as this one.
  const u = createUser({ name: "Aayan Javed Shaik", country: "IN", pin: "1234", kycStatus: "pending", createdAt: 1 });
  first = () => get<User>("SELECT * FROM users WHERE id = ?", u.id)!;
});

afterEach(() => {
  delete env.KYC_FLOW;
  delete env.KYC_CHECKS_PROVIDER;
  delete env.KYC_CHECKS_TEST_ALLOWED;
  delete env.KYC_DIGILOCKER_REDIRECT_URL;
  delete env.SETU_CLIENT_ID;
  delete env.SETU_CLIENT_SECRET;
  delete env.SETU_PRODUCT_INSTANCE_ID;
  delete env.SETU_BASE_URL;
  setCheckProviders(null);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Runs all three steps with the test provider. */
async function runSteps(u: User, pan = TEST_PAN_MATCH) {
  await submitPan(u, pan);
  const dl = await startDigiLocker(u, ORIGIN);
  await finishDigiLocker(u, dl.requestId);
  const bank = await startBank(u);
  return finishBank(u, bank.requestId);
}

describe("photo flow (the default)", () => {
  it("leaves GET /api/v1/kyc as it was and refuses the step routes", async () => {
    const res = await call(getKyc, "/kyc");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["docType", "idLast4", "reasons", "status", "updatedAt"]);
    const pan = await call(postPan, "/kyc/pan", { pan: TEST_PAN_MATCH });
    expect(pan).toMatchObject({ status: 409, body: { code: "kyc_flow_off" } });
  });

  it("keeps non-India accounts on the photo check when the steps flow is on", async () => {
    env.KYC_FLOW = "steps";
    const us = user("Alex Morgan", "US");
    expect(kycView(us()).flow).toBeUndefined();
    await expect(submitPan(us(), TEST_PAN_MATCH)).rejects.toMatchObject({ status: 409, code: "kyc_flow_off" });
  });
});

describe("steps flow through the routes, test provider", () => {
  it("goes from nothing to verified with the contract's shapes, storing no full PAN", async () => {
    env.KYC_FLOW = "steps";
    const start = await call(getKyc, "/kyc");
    expect(start.body).toMatchObject({
      status: "not_started",
      flow: "steps",
      steps: { pan: { status: "todo" }, aadhaar: { status: "todo" }, bank: { status: "todo" } },
    });

    expect(await call(postPan, "/kyc/pan", {})).toMatchObject({ status: 400 });
    expect(await call(postPan, "/kyc/pan", { pan: "ABCD1234F" })).toMatchObject({ status: 400, body: { code: "invalid_id" } });
    // Out of order.
    expect(await call(postDlStart, "/kyc/digilocker/start")).toMatchObject({ status: 409, body: { code: "kyc_step_order" } });

    const pan = await call(postPan, "/kyc/pan", { pan: "abcde 1234 f" });
    expect(pan.status).toBe(200);
    expect(pan.body.steps).toEqual({ pan: { status: "done", last4: "234F" }, aadhaar: { status: "todo" }, bank: { status: "todo" } });
    expect(await call(postPan, "/kyc/pan", { pan: TEST_PAN_MATCH })).toMatchObject({ status: 409, body: { code: "kyc_step_done" } });

    const dl = await call(postDlStart, "/kyc/digilocker/start");
    expect(dl.status).toBe(200);
    expect(Object.keys(dl.body).sort()).toEqual(["requestId", "url"]);
    const back = new URL(dl.body.url);
    expect(`${back.origin}${back.pathname}`).toBe("http://localhost:3000/verify");
    expect(back.searchParams.get("success")).toBe("True");
    expect(back.searchParams.get("id")).toBe(dl.body.requestId);

    const dlDone = await call(postDlFinish, "/kyc/digilocker/finish", { requestId: dl.body.requestId });
    expect(dlDone.body.steps.aadhaar).toEqual({ status: "done", last4: "1234" });
    // Finishing again just answers the view.
    expect(await call(postDlFinish, "/kyc/digilocker/finish", { requestId: dl.body.requestId })).toMatchObject({ status: 200 });
    expect(await call(postDlFinish, "/kyc/digilocker/finish", { requestId: "nope" })).toMatchObject({ status: 404, body: { code: "kyc_request_not_found" } });

    const bank = await call(postBankStart, "/kyc/bank/start");
    expect(bank.status).toBe(200);
    expect(Object.keys(bank.body).sort()).toEqual(["expiresAt", "requestId", "upiLink"]);
    expect(bank.body.upiLink).toMatch(/^upi:\/\/pay\?/);
    expect(bank.body.expiresAt).toBeGreaterThan(Date.now());

    const done = await call(postBankFinish, "/kyc/bank/finish", { requestId: bank.body.requestId });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({
      status: "verified",
      docType: "pan",
      idLast4: "234F",
      reasons: [],
      flow: "steps",
      steps: { pan: { status: "done", last4: "234F" }, aadhaar: { status: "done", last4: "1234" }, bank: { status: "done", last4: "4321" } },
    });
    expect(first()).toMatchObject({ kyc_status: "verified", kyc_level: 2 });
    expect(linkedBankAccount(first().id)).toMatchObject({ ifsc: "HDFC0000001", last4: "4321", holderName: "Aayan Javed Shaik", verified: true });
    expect(await call(postBankStart, "/kyc/bank/start")).toMatchObject({ status: 409, body: { code: "kyc_done" } });

    // Last 4 and the HMAC only.
    const rec = get<{ id_hash: string; provider: string }>("SELECT * FROM kyc_records WHERE user_id = ?", first().id)!;
    expect(rec).toMatchObject({ id_hash: idHash("pan", TEST_PAN_MATCH), provider: "checks:test" });
    const stored = JSON.stringify([
      all("SELECT * FROM kyc_checks WHERE user_id = ?", first().id),
      all("SELECT * FROM kyc_records WHERE user_id = ?", first().id),
      all("SELECT * FROM audit_log WHERE user_id = ?", first().id),
      all("SELECT * FROM bank_accounts WHERE user_id = ?", first().id),
    ]);
    expect(stored).not.toContain(TEST_PAN_MATCH);
    // The PAN name is kept like the other steps' names, so the final check can compare all three with the account name.
    expect(get<{ name: string | null }>("SELECT name FROM kyc_checks WHERE user_id = ? AND step = 'pan'", first().id)!.name).toBe("Aayan Javed Shaik");
  });

  it("uses KYC_DIGILOCKER_REDIRECT_URL when set", async () => {
    env.KYC_FLOW = "steps";
    env.KYC_DIGILOCKER_REDIRECT_URL = "https://vaultwise.example/kyc/back?from=dl";
    const u = user("Ira Sen");
    await submitPan(u(), TEST_PAN_MATCH);
    const { url } = await startDigiLocker(u(), ORIGIN);
    expect(url).toMatch(/^https:\/\/vaultwise\.example\/kyc\/back\?from=dl&success=True&id=/);
  });
});

describe("going to a person", () => {
  it("sends a name mismatch to the ID review queue once every step is finished, and a person decides", async () => {
    env.KYC_FLOW = "steps";
    const u = user("Rahul Verma");
    const afterPan = await submitPan(u(), TEST_PAN_MISMATCH);
    expect(afterPan.steps!.pan).toEqual({ status: "review", last4: "000F" });
    expect(afterPan.reasons.join(" ")).toMatch(/name on your PAN doesn't match/);
    // Not with a person yet: the other steps come first, so the reviewer sees every name.
    expect(u().kyc_status).toBe("pending");
    expect(kycQueue().queue.some((q) => q.userId === u().id)).toBe(false);

    const view = await runRest(u());
    expect(view).toMatchObject({ status: "needs_review", steps: { pan: { status: "review" }, aadhaar: { status: "done" }, bank: { status: "done" } } });
    expect(u()).toMatchObject({ kyc_status: "needs_review", kyc_level: 1 });
    const item = kycQueue().queue.find((q) => q.userId === u().id)!;
    expect(item).toMatchObject({ docType: "pan", idLast4: "000F", status: "needs_review", hasFile: false, provider: "checks:test" });
    expect(item.nameOnDoc).not.toBe("Rahul Verma");
    expect(item.checks.map((c) => c.label)).toEqual(["PAN", "Aadhaar (DigiLocker)", "Bank account"]);
    expect(item.checks[0].status).toBe("warn");
    expect(item.checks[2].detail).toContain("HDFC0000001 XXXX4321");
    await expect(submitPan(u(), TEST_PAN_MATCH)).rejects.toMatchObject({ status: 409, code: "kyc_in_review" });

    decideKyc(item.id, "verified", "ops@example.com", "PAN name is an old spelling");
    expect(kycView(u())).toMatchObject({ status: "verified", steps: { pan: { status: "done" }, aadhaar: { status: "done" }, bank: { status: "done" } } });
  });

  it("starts the steps again after a person rejects, with their note", async () => {
    env.KYC_FLOW = "steps";
    const u = user("Kavya Nair");
    await runSteps(u(), TEST_PAN_MISMATCH);
    const item = kycQueue().queue.find((q) => q.userId === u().id)!;
    decideKyc(item.id, "rejected", "ops@example.com", "This PAN belongs to someone else. Use your own PAN.");
    const view = kycView(u());
    expect(view).toMatchObject({ status: "rejected", steps: { pan: { status: "todo" }, aadhaar: { status: "todo" }, bank: { status: "todo" } } });
    expect(view.reasons).toEqual(["This PAN belongs to someone else. Use your own PAN."]);
    const again = await runSteps(u(), TEST_PAN_MATCH);
    expect(again.status).toBe("verified");
  });

  it("lets a person redo a step that went to review before the others are finished", async () => {
    env.KYC_FLOW = "steps";
    const u = user("Dev Malhotra");
    await submitPan(u(), TEST_PAN_MISMATCH);
    const redo = await submitPan(u(), TEST_PAN_MATCH);
    expect(redo.steps!.pan).toEqual({ status: "done", last4: "234F" });
    expect(redo.reasons).toEqual([]);
  });

  it("sends a PAN already on another account to a person (not for shared test PANs)", async () => {
    env.KYC_FLOW = "steps";
    const pan: PanVerifier = { name: "fake", verify: async (_p, s) => ({ status: "valid", registeredName: s.name }) };
    setCheckProviders({ pan });
    const a = user("Neha Gupta");
    expect((await submitPan(a(), "PQRST6789K")).steps!.pan.status).toBe("done");
    const b = user("Neha Gupta");
    const dup = await submitPan(b(), "pqrst6789k");
    expect(dup.steps!.pan.status).toBe("review");
    // The customer isn't told why (that would say whether a PAN belongs to someone with an account)...
    expect(dup.reasons).toEqual(["A person needs to look at your PAN before it can be accepted. A person will check it."]);
    expect(dup.reasons.join(" ")).not.toMatch(/another account/);
    // ...the reviewer is, in the PAN check line, once the other steps are finished.
    const done = await runRest(b());
    expect(done.status).toBe("needs_review");
    expect(done.reasons.join(" ")).not.toMatch(/another account/);
    const item = kycQueue().queue.find((q) => q.userId === b().id)!;
    expect(item.checks[0].detail).toMatch(/this PAN is already on another open account/);
    expect(item.reasons.join(" ")).not.toMatch(/another account/);
    const audit = get<{ details: string }>("SELECT details FROM audit_log WHERE user_id = ? AND action = 'kyc.step.pan' ORDER BY id DESC LIMIT 1", b().id)!;
    expect(JSON.parse(audit.details)).toMatchObject({ status: "review", duplicate: true });
  });

  it("sends a bank holder name that doesn't match to a person", async () => {
    env.KYC_FLOW = "steps";
    const bank: BankVerifier = {
      name: "fake",
      reversePennyDrop: async () => ({ requestId: `rpd_${Math.random()}`, upiLink: "upi://pay?pa=x@y", expiresAt: Date.now() + 60_000 }),
      result: async () => ({ status: "done", holderName: "Someone Else", ifsc: "sbin0000539", last4: "9129" }),
    };
    setCheckProviders({ bank });
    const u = user("Arjun Mehta");
    const view = await runSteps(u());
    expect(view).toMatchObject({ status: "needs_review", steps: { bank: { status: "review", last4: "9129" } } });
    expect(view.reasons.join(" ")).toMatch(/name on your bank account/);
    expect(linkedBankAccount(u().id)).toMatchObject({ ifsc: "SBIN0000539", last4: "9129", verified: false, verifiedAt: null });
    const item = kycQueue().queue.find((q) => q.userId === u().id)!;
    decideKyc(item.id, "verified", "ops@example.com", "Joint account, checked the passbook");
    expect(linkedBankAccount(u().id)).toMatchObject({ last4: "9129", verified: true });
  });

  it("never verifies a bank account from a try that started before a rejection", async () => {
    env.KYC_FLOW = "steps";
    let holder = "Someone Else";
    let last4 = "1111";
    const bank: BankVerifier = {
      name: "fake",
      reversePennyDrop: async () => ({ requestId: `rpd_${Math.random()}`, upiLink: "upi://pay?pa=x@y", expiresAt: Date.now() + 60_000 }),
      result: async () => ({ status: "done", holderName: holder, ifsc: "SBIN0000539", last4 }),
    };
    setCheckProviders({ bank });
    const u = user("Ishaan Kapoor");
    await runSteps(u());
    const first = kycQueue().queue.find((q) => q.userId === u().id)!;
    const firstAccount = linkedBankAccount(u().id)!;
    expect(firstAccount).toMatchObject({ last4: "1111", verified: false });
    decideKyc(first.id, "rejected", "ops@example.com", "Use an account in your own name");
    expect(linkedBankAccount(u().id)!.verified).toBe(false);
    // Again, with the person's own account: it passes, and the rejected try's account stays unverified.
    holder = "Ishaan Kapoor";
    last4 = "2222";
    const again = await runSteps(u());
    expect(again.status).toBe("verified");
    expect(linkedBankAccount(u().id)).toMatchObject({ last4: "2222", verified: true });
    expect(get<{ verified_at: number | null }>("SELECT verified_at FROM bank_accounts WHERE id = ?", firstAccount.id)!.verified_at).toBeNull();
  });

  it("verifies the bank account at once when the bank step passes", async () => {
    env.KYC_FLOW = "steps";
    const u = user("Pooja Sharma");
    await runSteps(u());
    expect(linkedBankAccount(u().id)).toMatchObject({ verified: true });
  });
});

describe("switching provider", () => {
  it("doesn't count steps finished with another provider (such as the test provider's sample data)", async () => {
    env.KYC_FLOW = "steps";
    const u = user("Sana Qureshi");
    await submitPan(u(), TEST_PAN_MATCH);
    const dl = await startDigiLocker(u(), ORIGIN);
    await finishDigiLocker(u(), dl.requestId);
    expect(kycView(u()).steps).toMatchObject({ pan: { status: "done" }, aadhaar: { status: "done" } });
    // The server switches the PAN check to another provider: that step starts again, and so does the order.
    const pan: PanVerifier = { name: "real", verify: async (_p, s) => ({ status: "valid", registeredName: s.name }) };
    setCheckProviders({ pan });
    expect(kycView(u()).steps).toMatchObject({ pan: { status: "todo" }, aadhaar: { status: "done" }, bank: { status: "todo" } });
    // The bank step can still run (its own step before it is done), but the check can't finish without the PAN.
    const bankStart = await startBank(u());
    const afterBank = await finishBank(u(), bankStart.requestId);
    expect(afterBank.status).not.toBe("verified");
    expect(u().kyc_status).toBe("pending");
    const afterPan = await submitPan(u(), "PQRST1234K");
    expect(afterPan.status).toBe("verified");
    // Once verified, the steps stay as they were whatever provider runs now.
    setCheckProviders(null);
    expect(kycView(u()).steps).toMatchObject({ pan: { status: "done" }, aadhaar: { status: "done" }, bank: { status: "done" } });
  });
});

/** DigiLocker and bank, after the PAN step. */
async function runRest(u: User) {
  const dl = await startDigiLocker(u, ORIGIN);
  await finishDigiLocker(u, dl.requestId);
  const bank = await startBank(u);
  return finishBank(u, bank.requestId);
}

describe("the account name during the steps", () => {
  it("holds the name once a step has compared it, so three steps can't match three people", async () => {
    env.KYC_FLOW = "steps";
    const u = user("Meera Iyer");
    expect(() => assertNameChangeAllowed(u(), "Someone Else")).not.toThrow();
    await submitPan(u(), TEST_PAN_MATCH);
    expect(() => assertNameChangeAllowed(u(), "Someone Else")).toThrow(expect.objectContaining({ status: 409, code: "name_in_check" }));
    expect(() => assertNameChangeAllowed(u(), "Meera Iyer")).not.toThrow();
  });

  it("frees the name after a person rejects the check", async () => {
    env.KYC_FLOW = "steps";
    const u = user("Arjun Rao");
    await submitPan(u(), TEST_PAN_MISMATCH);
    await runRest(u());
    expect(() => assertNameChangeAllowed(u(), "Arjun R")).toThrow(expect.objectContaining({ code: "name_in_check" }));
    const item = kycQueue().queue.find((q) => q.userId === u().id)!;
    decideKyc(item.id, "rejected", "ops@example.com", "Use your own documents");
    expect(() => assertNameChangeAllowed(u(), "Arjun R")).not.toThrow();
  });

  it("sends steps whose document names no longer match the account name to a person", async () => {
    env.KYC_FLOW = "steps";
    const u = user("Priya Das");
    await submitPan(u(), TEST_PAN_MATCH);
    // A rename that got past the hold (say, made directly in the database): the PAN matched the old name.
    run("UPDATE users SET name = ? WHERE id = ?", "Someone Else", u().id);
    const view = await runRest(u());
    expect(view.status).toBe("needs_review");
    expect(view.reasons.join(" ")).toMatch(/names on your documents don't all match/);
    expect(u().kyc_status).toBe("needs_review");
  });
});

describe("failures and limits", () => {
  it("fails an unknown PAN, lets the person try again, and stops after 5 tries a day", async () => {
    env.KYC_FLOW = "steps";
    const u = user("Maya Pillai");
    const failed = await submitPan(u(), "ZZZZZ9999Z");
    expect(failed.steps!.pan).toEqual({ status: "failed", last4: "999Z" });
    expect(failed.reasons).toEqual(["We couldn't find that PAN. Check it and try again."]);
    await expect(startDigiLocker(u(), ORIGIN)).rejects.toMatchObject({ code: "kyc_step_order" });
    for (let i = 0; i < 4; i++) await submitPan(u(), "ZZZZZ9999Z");
    await expect(submitPan(u(), TEST_PAN_MATCH)).rejects.toMatchObject({ status: 429, code: "rate_limited" });
  });

  it("drops a try when the provider is down, so it doesn't count", async () => {
    env.KYC_FLOW = "steps";
    const pan: PanVerifier = {
      name: "down",
      verify: async () => {
        throw Object.assign(new Error("down"), { status: 503 });
      },
    };
    setCheckProviders({ pan });
    const u = user("Om Prakash");
    await expect(submitPan(u(), TEST_PAN_MATCH)).rejects.toThrow("down");
    expect(get<{ n: number }>("SELECT COUNT(*) AS n FROM kyc_checks WHERE user_id = ?", u().id)!.n).toBe(0);
  });

  it("answers kyc_step_waiting until DigiLocker is done, and records a failed bank check", async () => {
    env.KYC_FLOW = "steps";
    let ready = false;
    const digilocker: DigiLockerClient = {
      name: "fake",
      start: async ({ redirectUrl }) => ({ requestId: `dl_${Math.random()}`, url: `https://dl.example/?r=${encodeURIComponent(redirectUrl)}`, expiresAt: Date.now() + 60_000 }),
      finish: async (_id, s) => (ready ? { status: "done", name: s.name.toUpperCase(), yearOfBirth: 1999, last4: "5678" } : { status: "waiting" }),
    };
    let pays = 0;
    const bank: BankVerifier = {
      name: "fake",
      reversePennyDrop: async () => ({ requestId: `rpd_${++pays}_${Math.random()}`, upiLink: "upi://pay?pa=x@y", expiresAt: Date.now() + 60_000 }),
      result: async () => ({ status: "failed", reason: "The ₹1 payment didn't go through. Try again." }),
    };
    setCheckProviders({ digilocker, bank });
    const u = user("Sara Thomas");
    await submitPan(u(), TEST_PAN_MATCH);
    const dl = await startDigiLocker(u(), ORIGIN);
    await expect(finishDigiLocker(u(), dl.requestId)).rejects.toMatchObject({ status: 409, code: "kyc_step_waiting" });
    ready = true;
    const view = await finishDigiLocker(u(), dl.requestId);
    expect(view.steps!.aadhaar).toEqual({ status: "done", last4: "5678" });
    const row = get<Record<string, unknown>>("SELECT * FROM kyc_checks WHERE user_id = ? AND step = 'aadhaar' AND status = 'done'", u().id)!;
    expect(row).toMatchObject({ name: "SARA THOMAS", year_of_birth: 1999, last4: "5678" });

    const b = await startBank(u());
    const failed = await finishBank(u(), b.requestId);
    expect(failed.steps!.bank).toEqual({ status: "failed" });
    expect(failed.reasons).toContain("The ₹1 payment didn't go through. Try again.");
    expect(linkedBankAccount(u().id)).toBeNull();
    // A new link replaces the old one; the old request no longer finishes.
    const b2 = await startBank(u());
    const b3 = await startBank(u());
    await expect(finishBank(u(), b2.requestId)).rejects.toMatchObject({ status: 409, code: "kyc_request_expired" });
    expect((await finishBank(u(), b3.requestId)).steps!.bank.status).toBe("failed");
  });

  it("expires an old request, and won't finish another person's", async () => {
    env.KYC_FLOW = "steps";
    const digilocker: DigiLockerClient = {
      name: "fake",
      start: async () => ({ requestId: `dl_${Math.random()}`, url: "https://dl.example/", expiresAt: Date.now() - 1 }),
      finish: async (_id, s) => ({ status: "done", name: s.name, yearOfBirth: null, last4: null }),
    };
    setCheckProviders({ digilocker });
    const u = user("Tanvi Joshi");
    await submitPan(u(), TEST_PAN_MATCH);
    const dl = await startDigiLocker(u(), ORIGIN);
    await expect(finishDigiLocker(u(), dl.requestId)).rejects.toMatchObject({ status: 409, code: "kyc_request_expired" });
    const other = user("Tanvi Joshi");
    await expect(finishDigiLocker(other(), dl.requestId)).rejects.toMatchObject({ status: 404, code: "kyc_request_not_found" });
  });

  it("refuses the test provider on a production server unless allowed", async () => {
    env.KYC_FLOW = "steps";
    const u = user("Leela Rao");
    vi.stubEnv("IDENTITY_SECRET", "a-production-secret");
    vi.stubEnv("NODE_ENV", "production");
    await expect(submitPan(u(), TEST_PAN_MATCH)).rejects.toMatchObject({ status: 500, code: "server_config" });
    vi.stubEnv("KYC_CHECKS_TEST_ALLOWED", "true");
    expect((await submitPan(u(), TEST_PAN_MATCH)).steps!.pan.status).toBe("done");
  });
});

/* ---------- Setu adapter, with fetch mocked ---------- */

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function mockFetch(routes: Record<string, (c: Call) => { status: number; body: unknown }>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const c: Call = {
      url,
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(c);
    const path = new URL(url).pathname;
    const key = Object.keys(routes).find((k) => {
      const [m, p] = k.split(" ");
      return m === c.method && new RegExp(`^${p}$`).test(path);
    });
    if (!key) throw new Error(`unexpected ${c.method} ${path}`);
    const r = routes[key](c);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

function setuEnv() {
  env.SETU_CLIENT_ID = "client-id";
  env.SETU_CLIENT_SECRET = "client-secret";
  env.SETU_PRODUCT_INSTANCE_ID = "instance-id";
}

const subject = { userId: "usr_x", name: "Jack Doe" };
const FULL_ACCOUNT = "9009120939129";

describe("Setu on a production server", () => {
  const prod = (extra: Record<string, string> = {}) => ({ NODE_ENV: "production", ...extra });

  it("needs SETU_BASE_URL set to an https URL, and refuses the sandbox unless test data is allowed", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(setuBaseUrl({})).toBe("https://dg-sandbox.setu.co");
    expect(setuBaseUrl({ SETU_BASE_URL: "https://dg.setu.co/" })).toBe("https://dg.setu.co");
    expect(() => setuBaseUrl(prod())).toThrow(expect.objectContaining({ status: 500, code: "server_config" }));
    expect(() => setuBaseUrl(prod({ SETU_BASE_URL: "http://dg.setu.co" }))).toThrow(expect.objectContaining({ code: "server_config" }));
    expect(() => setuBaseUrl(prod({ SETU_BASE_URL: "https://dg-sandbox.setu.co" }))).toThrow(expect.objectContaining({ code: "server_config" }));
    expect(setuBaseUrl(prod({ SETU_BASE_URL: "https://dg-sandbox.setu.co", KYC_CHECKS_TEST_ALLOWED: "true" }))).toBe("https://dg-sandbox.setu.co");
    expect(setuBaseUrl(prod({ SETU_BASE_URL: "https://dg.setu.co" }))).toBe("https://dg.setu.co");
    expect(isSetuSandbox("https://DG-SANDBOX.setu.co/api")).toBe(true);
    expect(isSetuSandbox("https://dg.setu.co")).toBe(false);
  });

  it("refuses a PAN check through Setu without SETU_BASE_URL, before calling anyone", async () => {
    setuEnv();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NODE_ENV", "production");
    await expect(setuPan.verify("ABCDE1234A", subject)).rejects.toMatchObject({ status: 500, code: "server_config" });
    vi.stubEnv("SETU_BASE_URL", "https://dg-sandbox.setu.co");
    await expect(setuPan.verify("ABCDE1234A", subject)).rejects.toMatchObject({ status: 500, code: "server_config" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warns at start-up about a missing or sandbox SETU_BASE_URL", () => {
    const base = { NODE_ENV: "production", FIREBASE_PROJECT_ID: "p", IDENTITY_SECRET: "s", ADMIN_EMAILS: "a@b.c", FIREBASE_WEB_API_KEY: "k", TRUST_PROXY_HOPS: "1" };
    const setu = { ...base, KYC_FLOW: "steps", KYC_CHECKS_PROVIDER: "setu" };
    expect(productionStartupWarnings(base)).toEqual([]);
    expect(productionStartupWarnings(setu).join(" ")).toMatch(/SETU_BASE_URL is not set/);
    expect(productionStartupWarnings({ ...setu, SETU_BASE_URL: "https://dg-sandbox.setu.co" }).join(" ")).toMatch(/Setu's sandbox/);
    expect(productionStartupWarnings({ ...setu, SETU_BASE_URL: "https://dg-sandbox.setu.co", KYC_CHECKS_TEST_ALLOWED: "true" })).toEqual([]);
    expect(productionStartupWarnings({ ...setu, SETU_BASE_URL: "https://dg.setu.co" })).toEqual([]);
  });
});

describe("DigiLocker's return link on the web", () => {
  it("shows fixed sentences for known error codes and never the link's own text", () => {
    expect(digilockerErrorText("access_denied")).toMatch(/didn't allow sharing/);
    expect(digilockerErrorText(" Session-Expired ")).toMatch(/timed out/);
    expect(digilockerErrorText("Call +91 99999 99999 to finish your KYC")).toBe("DigiLocker didn't finish. Try again.");
    expect(digilockerErrorText(null)).toBe("DigiLocker didn't finish. Try again.");
    expect(digilockerErrorText("__proto__")).toBe("DigiLocker didn't finish. Try again.");
  });
});

describe("Setu adapter (written from the docs, fetch mocked)", () => {
  it("answers 503 provider_unavailable without keys, and on network errors or 5xx", async () => {
    await expect(setuPan.verify("ABCDE1234A", subject)).rejects.toMatchObject({ status: 503, code: "provider_unavailable" });
    setuEnv();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(setuPan.verify("ABCDE1234A", subject)).rejects.toMatchObject({ status: 503, code: "provider_unavailable" });
    mockFetch({ "POST /api/verify/pan": () => ({ status: 500, body: { error: { code: "internal_server_error", traceId: "t" } } }) });
    await expect(setuPan.verify("ABCDE1234A", subject)).rejects.toMatchObject({ status: 503, code: "provider_unavailable" });
  });

  it("verifies a PAN with the documented headers and body", async () => {
    setuEnv();
    const calls = mockFetch({
      "POST /api/verify/pan": (c) => {
        const pan = (c.body as { pan: string }).pan;
        if (pan === "ABCDE1234A")
          return { status: 200, body: { data: { full_name: "John Doe", first_name: "John", last_name: "Doe", category: "Individual" }, message: "PAN is valid", verification: "success", traceId: "1-a" } };
        if (pan === "ABCDE1234B") return { status: 200, body: { verification: "failed", message: "PAN is invalid", traceId: "1-b" } };
        return { status: 404, body: { error: { code: "pan_not_found", detail: "PAN not found", traceId: "1-c" } } };
      },
    });
    expect(await setuPan.verify("ABCDE1234A", subject)).toMatchObject({ status: "valid", registeredName: "John Doe", sample: true });
    expect(await setuPan.verify("ABCDE1234B", subject)).toMatchObject({ status: "invalid", registeredName: null });
    expect(await setuPan.verify("ABCDE1234C", subject)).toMatchObject({ status: "not_found" });
    expect(calls[0].url).toBe("https://dg-sandbox.setu.co/api/verify/pan");
    expect(calls[0].headers).toMatchObject({ "x-client-id": "client-id", "x-client-secret": "client-secret", "x-product-instance-id": "instance-id" });
    const body = calls[0].body as { consent: string; reason: string };
    expect(body.consent).toBe("Y");
    expect(body.reason.length).toBeGreaterThanOrEqual(20);
    env.SETU_BASE_URL = "https://dg.setu.co";
    expect((await setuPan.verify("ABCDE1234A", subject)).sample).toBe(false);
  });

  it("runs DigiLocker: create, status, Aadhaar (keeping name, year and last 4), revoke", async () => {
    setuEnv();
    let authenticated = false;
    const calls = mockFetch({
      "POST /api/digilocker/": () => ({ status: 200, body: { id: "dl-1", status: "unauthenticated", url: "https://digilocker.example/login", validUpto: "2026-11-22T19:06:28+05:30" } }),
      "GET /api/digilocker/dl-1/status": () => ({ status: 200, body: { id: "dl-1", status: authenticated ? "authenticated" : "unauthenticated" } }),
      "GET /api/digilocker/dl-1/aadhaar": () => ({
        status: 200,
        body: { id: "dl-1", status: "complete", aadhaar: { name: "Jack Doe", dateOfBirth: "01-01-1990", maskedNumber: "xxxx-xxxx-1234", address: { house: "1" }, xml: { fileUrl: "https://s3.example/x" } } },
      }),
      "GET /api/digilocker/dl-1/revoke": () => ({ status: 200, body: { success: true } }),
    });
    const s = await setuDigiLocker.start({ redirectUrl: "https://vaultwise.example/verify", subject });
    expect(s).toEqual({ requestId: "dl-1", url: "https://digilocker.example/login", expiresAt: Date.parse("2026-11-22T19:06:28+05:30") });
    expect(calls[0].body).toEqual({ redirectUrl: "https://vaultwise.example/verify" });
    expect(await setuDigiLocker.finish("dl-1", subject)).toEqual({ status: "waiting" });
    authenticated = true;
    const r = await setuDigiLocker.finish("dl-1", subject);
    expect(r).toEqual({ status: "done", name: "Jack Doe", yearOfBirth: 1990, last4: "1234", reference: "dl-1" });
    expect(calls.some((c) => c.url.endsWith("/revoke"))).toBe(true);
  });

  it("reports DigiLocker failures in plain words", async () => {
    setuEnv();
    mockFetch({
      "GET /api/digilocker/gone/status": () => ({ status: 404, body: { error: { code: "request_not_found" } } }),
      "GET /api/digilocker/nolink/status": () => ({ status: 200, body: { status: "authenticated" } }),
      "GET /api/digilocker/nolink/aadhaar": () => ({ status: 400, body: { error: { code: "aadhaar_not_linked" } } }),
    });
    expect(await setuDigiLocker.finish("gone", subject)).toMatchObject({ status: "failed", reason: expect.stringMatching(/expired/) });
    expect(await setuDigiLocker.finish("nolink", subject)).toMatchObject({ status: "failed", reason: expect.stringMatching(/Aadhaar/) });
  });

  it("runs a reverse penny drop and never returns the full account number", async () => {
    setuEnv();
    let state = "BAV_REVERSE_PENNY_DROP_CREATED";
    let accountType = "BANK_ACCOUNT";
    mockFetch({
      "POST /api/verify/ban/reverse": () => ({
        status: 201,
        body: {
          id: "rpd-1",
          shortUrl: "https://sandbox.bills.pe/x",
          status: "BAV_REVERSE_PENNY_DROP_CREATED",
          upiBillId: "a6577",
          upiLink: "upi://pay?pa=bauvatest@kaypay&pn=BauvaTest&am=1.00&tr=a6577&tn=Account%20Verification&cu=INR&mode=04",
          validUpto: "2026-11-22T13:20:52.277688",
        },
      }),
      "GET /api/verify/ban/reverse/rpd-1": () => ({
        status: 200,
        body: {
          id: "rpd-1",
          status: state,
          data:
            state === "BAV_REVERSE_PENNY_DROP_PAYMENT_SUCCESSFUL"
              ? { accountType, bankAccountType: "SAVINGS", bankAccountIfsc: "sbin0000539", bankAccountName: "Jack Doe", bankAccountNumber: FULL_ACCOUNT, payerVpa: "jack@vpa" }
              : null,
        },
      }),
    });
    const s = await setuBank.reversePennyDrop(subject);
    expect(s.requestId).toBe("rpd-1");
    expect(s.upiLink).toMatch(/^upi:\/\/pay\?/);
    expect(s.expiresAt).toBe(Date.parse("2026-11-22T13:20:52.277688+05:30"));
    expect(await setuBank.result("rpd-1", subject)).toEqual({ status: "waiting" });
    state = "BAV_REVERSE_PENNY_DROP_PAYMENT_SUCCESSFUL";
    const r = await setuBank.result("rpd-1", subject);
    expect(r).toEqual({ status: "done", holderName: "Jack Doe", ifsc: "SBIN0000539", last4: "9129", reference: "rpd-1" });
    expect(JSON.stringify(r)).not.toContain(FULL_ACCOUNT);
    accountType = "PPI";
    expect(await setuBank.result("rpd-1", subject)).toMatchObject({ status: "failed", reason: expect.stringMatching(/wallet/) });
    state = "BAV_REVERSE_PENNY_DROP_EXPIRED";
    expect(await setuBank.result("rpd-1", subject)).toMatchObject({ status: "failed", reason: expect.stringMatching(/expired/) });
  });

  it("parses Setu's dates, masked numbers and dates of birth", () => {
    expect(setuTime("2023-03-13T13:20:52.277688")).toBe(Date.parse("2023-03-13T13:20:52.277688+05:30"));
    expect(setuTime("2021-10-05T19:06:28+05:30")).toBe(Date.parse("2021-10-05T19:06:28+05:30"));
    expect(setuTime(undefined)).toBeNull();
    expect(lastDigits("xxxx-xxxx-1234")).toBe("1234");
    expect(lastDigits("12")).toBeNull();
    expect(yearOf("01-01-1990")).toBe(1990);
    expect(yearOf("1985-07-20")).toBe(1985);
    expect(yearOf("")).toBeNull();
  });

  it("drives the whole steps flow through Setu without storing a full number", async () => {
    env.KYC_FLOW = "steps";
    env.KYC_CHECKS_PROVIDER = "setu";
    setuEnv();
    mockFetch({
      "POST /api/verify/pan": () => ({ status: 200, body: { data: { full_name: "Jack Doe" }, verification: "success", traceId: "t" } }),
      "POST /api/digilocker/": (c) => ({ status: 200, body: { id: "dl-9", url: `https://digilocker.example/?back=${(c.body as { redirectUrl: string }).redirectUrl}`, validUpto: "2099-01-01T00:00:00+05:30" } }),
      "GET /api/digilocker/dl-9/status": () => ({ status: 200, body: { status: "authenticated" } }),
      "GET /api/digilocker/dl-9/aadhaar": () => ({ status: 200, body: { aadhaar: { name: "JACK DOE", dateOfBirth: "02-03-1991", maskedNumber: "xxxx-xxxx-8765" } } }),
      "GET /api/digilocker/dl-9/revoke": () => ({ status: 200, body: { success: true } }),
      "POST /api/verify/ban/reverse": () => ({ status: 201, body: { id: "rpd-9", upiLink: "upi://pay?pa=a@b", validUpto: "2099-01-01T00:00:00" } }),
      "GET /api/verify/ban/reverse/rpd-9": () => ({
        status: 200,
        body: { status: "BAV_REVERSE_PENNY_DROP_PAYMENT_SUCCESSFUL", data: { accountType: "BANK_ACCOUNT", bankAccountIfsc: "SBIN0000539", bankAccountName: "Jack Doe", bankAccountNumber: FULL_ACCOUNT } },
      }),
    });
    const u = user("Jack Doe");
    const view = await runSteps(u(), "ABCDE1234A");
    expect(view).toMatchObject({ status: "verified", steps: { pan: { status: "done", last4: "234A" }, aadhaar: { status: "done", last4: "8765" }, bank: { status: "done", last4: "9129" } } });
    const stored = JSON.stringify([
      all("SELECT * FROM kyc_checks WHERE user_id = ?", u().id),
      all("SELECT * FROM kyc_records WHERE user_id = ?", u().id),
      all("SELECT * FROM bank_accounts WHERE user_id = ?", u().id),
      all("SELECT * FROM audit_log WHERE user_id = ?", u().id),
    ]);
    expect(stored).not.toContain(FULL_ACCOUNT);
    expect(stored).not.toContain("ABCDE1234A");
    expect(get("SELECT provider FROM kyc_records WHERE user_id = ?", u().id)).toEqual({ provider: "checks:setu" });
  });
});
