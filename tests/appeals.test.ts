import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { get } from "@/lib/db";
import { transfer, userAccount, worldAccount } from "@/lib/ledger";
import { createUser, type HttpError, type User } from "@/lib/users";
import { createVault, createWithdrawal, deposit } from "@/lib/vaults";
import { appeal, createProof, reviewDecision, runPipeline } from "@/lib/verification/pipeline";

const created = createUser({ name: "Noor Ali", country: "IN", pin: "2468" });
const fresh = () => get<User>("SELECT * FROM users WHERE id = ?", created.id)!;
transfer({ userId: created.id, from: worldAccount(created.currency).id, to: userAccount(created.id, "bank", created.currency).id, amount: 10_00_000_00, kind: "income", memo: "seed" });
const vaultId = createVault(fresh(), { name: "Health", category: "health", target: 5_00_000_00 });
deposit(fresh(), vaultId, 1_00_000_00);

describe("appeals", () => {
  it("allows one appeal per check, then refuses another", async () => {
    const withdrawalId = createWithdrawal(fresh(), vaultId, 2_000_00, "City Clinic");
    const proofId = createProof(fresh(), {
      buffer: fs.readFileSync(path.join(process.cwd(), "mobile", "assets", "samples", "medical-invoice.jpg")),
      fileName: "medical-invoice.jpg",
      mime: "image/jpeg",
      purpose: "withdrawal",
      category: "health",
      vaultId,
      withdrawalId,
      aiAllowed: true,
    });
    // No AI key in tests, so the bill goes to a person.
    await runPipeline(proofId);
    reviewDecision(proofId, "denied", "reviewer@test", "Name doesn't match");

    appeal(fresh(), proofId, "It's my mother's bill, please look again");
    reviewDecision(proofId, "denied", "reviewer@test", "Still not covered");

    let err: HttpError | undefined;
    try {
      appeal(fresh(), proofId, "Please look a third time");
    } catch (e) {
      err = e as HttpError;
    }
    expect(err).toMatchObject({ status: 409, code: "already_appealed" });
    expect(get<{ final_decision: string }>("SELECT final_decision FROM verifications WHERE proof_id = ?", proofId)?.final_decision).toBe("denied");
  });
});
