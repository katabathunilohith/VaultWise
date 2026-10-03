import { customer, handle } from "@/lib/api";
import { all } from "@/lib/db";
import { audit } from "@/lib/audit";

/** Data-subject access export (GDPR Art. 15 / CCPA / DPDP right to access). */
export const GET = handle(async () => {
  const user = await customer({ tick: false });
  const { pin_hash: _pin, ...profile } = user;
  void _pin;
  const data = {
    exportedAt: new Date().toISOString(),
    profile,
    vaults: all("SELECT * FROM vaults WHERE user_id = ?", user.id),
    accounts: all("SELECT * FROM accounts WHERE user_id = ?", user.id),
    journals: all("SELECT * FROM journals WHERE user_id = ?", user.id),
    ledgerEntries: all("SELECT e.* FROM ledger_entries e JOIN accounts a ON a.id = e.account_id WHERE a.user_id = ?", user.id),
    withdrawals: all("SELECT * FROM withdrawals WHERE user_id = ?", user.id),
    proofs: all("SELECT id, purpose, category, file_name, mime, size, sha256, extracted, created_at FROM proofs WHERE user_id = ?", user.id),
    emergencyRequests: all("SELECT * FROM emergency_requests WHERE user_id = ?", user.id),
    bankTransactions: all("SELECT * FROM bank_transactions WHERE user_id = ?", user.id),
    holdings: all("SELECT * FROM holdings WHERE user_id = ?", user.id),
    orders: all("SELECT * FROM orders WHERE user_id = ?", user.id),
    paperPositions: all("SELECT * FROM paper_positions WHERE user_id = ?", user.id),
    auditLog: all("SELECT * FROM audit_log WHERE user_id = ? ORDER BY id", user.id),
  };
  audit({ userId: user.id, actor: user.id, actorType: "user", action: "privacy.data_exported", entityType: "user", entityId: user.id });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="vaultwise-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
