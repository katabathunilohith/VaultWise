import { describe, expect, it } from "vitest";
import { get } from "@/lib/db";
import { transfer, userAccount, worldAccount } from "@/lib/ledger";
import { renderSample } from "@/lib/samples";
import { createUser, type HttpError, type User } from "@/lib/users";
import { createVault, createWithdrawal, deposit, getVaultRow, toView } from "@/lib/vaults";
import { appeal, createProof, reviewDecision, runPipeline } from "@/lib/verification/pipeline";

const created = createUser({ name: "Noor Ali", country: "IN", pin: "2468" });
const fresh = () => get<User>("SELECT * FROM users WHERE id = ?", created.id)!;
transfer({ userId: created.id, from: worldAccount(created.currency).id, to: userAccount(created.id, "bank", created.currency).id, amount: 10_00_000_00, kind: "income", memo: "seed" });

/** A withdrawal backed by a freshly rendered sample bill; no AI key in tests, so the bill goes to a person. */
async function withdrawWithProof(vaultId: string, amount: number, sample: string) {
  const withdrawalId = createWithdrawal(fresh(), vaultId, amount, "City Clinic");
  const proofId = createProof(fresh(), {
    buffer: await renderSample(sample, fresh()),
    fileName: `${sample}.jpg`,
    mime: "image/jpeg",
    purpose: "withdrawal",
    category: "health",
    vaultId,
    withdrawalId,
    aiAllowed: true,
  });
  await runPipeline(proofId);
  return { withdrawalId, proofId };
}

function caught(fn: () => void) {
  try {
    fn();
  } catch (e) {
    return e as HttpError;
  }
  return undefined;
}

describe("appeals", () => {
  it("allows one appeal per check, then refuses another", async () => {
    const vaultId = createVault(fresh(), { name: "Health", category: "health", target: 5_00_000_00 });
    deposit(fresh(), vaultId, 1_00_000_00);
    const { proofId } = await withdrawWithProof(vaultId, 2_000_00, "medical-invoice");
    reviewDecision(proofId, "denied", "reviewer@test", "Name doesn't match");

    appeal(fresh(), proofId, "It's my mother's bill, please look again");
    reviewDecision(proofId, "denied", "reviewer@test", "Still not covered");

    expect(caught(() => appeal(fresh(), proofId, "Please look a third time"))).toMatchObject({ status: 409, code: "already_appealed" });
    expect(get<{ final_decision: string }>("SELECT final_decision FROM verifications WHERE proof_id = ?", proofId)?.final_decision).toBe("denied");
  });

  it("refuses an appeal when the money has left the vault since the decline, and allows it once it's back", async () => {
    const vaultId = createVault(fresh(), { name: "Clinic visits", category: "health", target: 5_00_000_00 });
    deposit(fresh(), vaultId, 10_000_00);
    const declined = await withdrawWithProof(vaultId, 6_000_00, "pharmacy-receipt");
    reviewDecision(declined.proofId, "denied", "reviewer@test", "Receipt is for someone else");

    // Meanwhile most of the vault is paid out against another bill.
    const paid = await withdrawWithProof(vaultId, 8_000_00, "rent-receipt");
    reviewDecision(paid.proofId, "approved", "reviewer@test", "OK");
    const available = () => toView(getVaultRow(fresh(), vaultId), fresh().currency).available;
    expect(available()).toBe(2_000_00);

    const err = caught(() => appeal(fresh(), declined.proofId, "Please look again"));
    expect(err).toMatchObject({ status: 409, code: "appeal_funds_unavailable" });
    // Nothing changed: still declined, not held, and the vault never shows a negative balance.
    expect(get<{ final_decision: string; appeal_note: string | null }>("SELECT final_decision, appeal_note FROM verifications WHERE proof_id = ?", declined.proofId)).toMatchObject({
      final_decision: "denied",
      appeal_note: null,
    });
    expect(get<{ status: string }>("SELECT status FROM withdrawals WHERE id = ?", declined.withdrawalId)?.status).toBe("denied");
    expect(available()).toBe(2_000_00);

    // With the money back, the appeal goes through and a reviewer's approval pays out.
    deposit(fresh(), vaultId, 4_000_00);
    appeal(fresh(), declined.proofId, "Please look again");
    expect(get<{ status: string }>("SELECT status FROM withdrawals WHERE id = ?", declined.withdrawalId)?.status).toBe("appealed");
    expect(available()).toBe(0);
    reviewDecision(declined.proofId, "approved", "reviewer@test", "It was a dependant");
    expect(get<{ status: string }>("SELECT status FROM withdrawals WHERE id = ?", declined.withdrawalId)?.status).toBe("paid");
  });
});
