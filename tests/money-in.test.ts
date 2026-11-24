import { afterEach, describe, expect, it } from "vitest";
import { get, run } from "@/lib/db";
import { balanceOf, transfer, userAccount, worldAccount } from "@/lib/ledger";
import { createUser, type User } from "@/lib/users";
import { createVault, recordSpend } from "@/lib/vaults";
import { topUp } from "@/lib/wallet";
import { MONEY_ACTIONS, MONEY_ROUTES } from "@/lib/money-routes";
import { requireMpin } from "@/lib/mpin";
import { POST as topUpRoute } from "@/app/api/v1/wallet/top-up/route";
import { POST as moveRoute } from "@/app/api/v1/wallet/move/route";
import { POST as depositRoute } from "@/app/api/v1/vaults/[id]/deposits/route";
import { POST as createVaultRoute } from "@/app/api/v1/vaults/route";
import { POST as simulateRoute } from "@/app/api/v1/accounts/simulate/route";
import { POST as sweepRoute } from "@/app/api/v1/accounts/sweep/route";

/**
 * Security review gap 7: one rule for money in, taken from the money map. Money entering from the linked bank needs a
 * verified ID (the `kyc` gate, off with KYC_ENFORCED=false) and no MPIN; wallet → vault stays `wallet_move`.
 */

const PIN = "482915";
function req(path: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const call = (h: unknown, request: Request, context?: unknown) => (h as (...a: unknown[]) => Promise<Response>)(request, context);

// Prototype mode: the first user is the customer every route acts for.
const main = createUser({ name: "Noor Saver", jurisdiction: "US", pin: PIN, createdAt: Date.now() - 60_000 });
const me = () => get<User>("SELECT * FROM users WHERE id = ?", main.id)!;
transfer({ userId: main.id, from: worldAccount("USD").id, to: userAccount(main.id, "bank", "USD").id, amount: 5_000_00, kind: "income", memo: "seed" });
const rainy = createVault(me(), { name: "Rainy", category: "emergency", target: 1_000_00, ruleType: "roundup" });
topUp(me(), 100_00);
recordSpend(me(), "Corner Coffee", "coffee", 3_40); // a pending round-up for the sweep
const journals = () => get<{ n: number }>("SELECT COUNT(*) AS n FROM journals WHERE user_id = ?", main.id)!.n;
const vaultCount = () => get<{ n: number }>("SELECT COUNT(*) AS n FROM vaults WHERE user_id = ?", main.id)!.n;

/** Every money-in route, with no `pin` in the body. */
const MONEY_IN = [
  { action: "wallet_top_up", send: () => call(topUpRoute, req("/api/v1/wallet/top-up", { amount: 1 })) },
  { action: "vault_deposit", send: () => call(depositRoute, req(`/api/v1/vaults/${rainy}/deposits`, { amount: 1 }), ctx(rainy)) },
  {
    action: "vault_deposit (opening deposit)",
    send: () => call(createVaultRoute, req("/api/v1/vaults", { name: "Trip", category: "custom", template: "emergency", target: 100, initialDeposit: 1 })),
  },
  { action: "bank_simulate", send: () => call(simulateRoute, req("/api/v1/accounts/simulate", { type: "salary" })) },
  { action: "roundup_sweep", send: () => call(sweepRoute, req("/api/v1/accounts/sweep")) },
];

const setKyc = (status: string) => run("UPDATE users SET kyc_status = ? WHERE id = ?", status, main.id);
afterEach(() => {
  setKyc("verified");
  delete process.env.KYC_ENFORCED;
});

describe("the money map's money-in rule", () => {
  it("marks every money-in action: ID gate on, MPIN off", () => {
    const moneyIn = MONEY_ACTIONS.filter((a) => (MONEY_ROUTES[a] as { moneyIn?: boolean }).moneyIn).sort();
    expect(moneyIn).toEqual(["bank_simulate", "roundup_sweep", "vault_deposit", "wallet_top_up"]);
    for (const a of moneyIn) expect(MONEY_ROUTES[a]).toMatchObject({ mpin: false, kyc: true });
    // Money already inside the account (wallet → vault) keeps today's rule.
    expect(MONEY_ROUTES.wallet_move).toMatchObject({ mpin: true, kyc: true });
    expect(requireMpin(me(), undefined, "vault_deposit")).toBe(false); // never asks for, or checks, a PIN
  });

  it.each(MONEY_IN)("$action: refused without a verified ID, moving nothing", async ({ send }) => {
    setKyc("pending");
    const before = { journals: journals(), vaults: vaultCount() };
    const r = await send();
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "Verify your ID to move money.", code: "kyc_required" });
    expect({ journals: journals(), vaults: vaultCount() }).toEqual(before); // the opening deposit didn't leave an empty vault behind
  });

  it.each(MONEY_IN)("$action: works with a verified ID and no MPIN", async ({ send }) => {
    const r = await send();
    expect([200, 201]).toContain(r.status);
  });

  it("follows KYC_ENFORCED=false like every other ID gate", async () => {
    setKyc("pending");
    process.env.KYC_ENFORCED = "false";
    const r = await call(depositRoute, req(`/api/v1/vaults/${rainy}/deposits`, { amount: 1 }), ctx(rainy));
    expect(r.status).toBe(201);
  });

  it("lets a vault be created without an opening deposit while the ID check is pending", async () => {
    setKyc("pending");
    const r = await call(createVaultRoute, req("/api/v1/vaults", { name: "Someday", category: "custom", template: "emergency", target: 100 }));
    expect(r.status).toBe(201);
  });

  it("keeps wallet → vault as wallet_move: the ID gate and the MPIN", async () => {
    setKyc("pending");
    expect((await (await call(moveRoute, req("/api/v1/wallet/move", { vaultId: rainy, amount: 1, pin: PIN }))).json()).code).toBe("kyc_required");
    setKyc("verified");
    expect((await (await call(moveRoute, req("/api/v1/wallet/move", { vaultId: rainy, amount: 1 }))).json()).code).toBe("mpin_required");
    const before = balanceOf(get<{ account_id: string }>("SELECT account_id FROM vaults WHERE id = ?", rainy)!.account_id);
    expect((await call(moveRoute, req("/api/v1/wallet/move", { vaultId: rainy, amount: 1, pin: PIN }))).status).toBe(201);
    expect(balanceOf(get<{ account_id: string }>("SELECT account_id FROM vaults WHERE id = ?", rainy)!.account_id)).toBe(before + 1_00);
  });
});

describe("POST /vaults with an opening deposit", () => {
  const create = (body: Record<string, unknown>) => call(createVaultRoute, req("/api/v1/vaults", body));
  const customRules = () =>
    get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'vault_custom_rules'")
      ? get<{ n: number }>("SELECT COUNT(*) AS n FROM vault_custom_rules")!.n
      : 0;

  it("creates the vault and its deposit together: a deposit the bank can't cover leaves no empty vault", async () => {
    const before = { vaults: vaultCount(), journals: journals(), rules: customRules() };
    const r = await create({
      name: "Too big",
      category: "custom",
      customRule: { uses: ["Concert tickets"], proof: "The ticket receipt" },
      target: 100,
      initialDeposit: 1_000_000,
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/Insufficient funds/);
    expect({ vaults: vaultCount(), journals: journals(), rules: customRules() }).toEqual(before);
  });

  it("still creates both when the deposit goes through", async () => {
    const before = vaultCount();
    const r = await create({ name: "Holiday", category: "custom", customRule: { uses: ["Flights"], proof: "The booking" }, target: 100, initialDeposit: 2 });
    expect(r.status).toBe(201);
    const { id } = await r.json();
    expect(vaultCount()).toBe(before + 1);
    expect(balanceOf(get<{ account_id: string }>("SELECT account_id FROM vaults WHERE id = ?", id)!.account_id)).toBe(2_00);
    expect(get("SELECT 1 FROM vault_custom_rules WHERE vault_id = ?", id)).toBeTruthy();
  });
});
