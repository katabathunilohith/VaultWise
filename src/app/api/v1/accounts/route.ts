import { customer, handle, json } from "@/lib/api";
import { all, get } from "@/lib/db";
import { balanceOf, userAccount } from "@/lib/ledger";
import { pendingRoundups } from "@/lib/vaults";

export const GET = handle(async () => {
  const user = await customer();
  const bankBalance = balanceOf(userAccount(user.id, "bank", user.currency).id);
  const accounts = all<{ id: string; institution: string; name: string; kind: string; mask: string; balance: number; is_primary: number }>(
    "SELECT * FROM external_accounts WHERE user_id = ? ORDER BY is_primary DESC, created_at",
    user.id,
  ).map((a) => ({ ...a, balance: a.is_primary ? bankBalance : a.balance }));
  if (!accounts.length) {
    accounts.push({
      id: "primary",
      institution: "Linked bank",
      name: "Everyday Checking",
      kind: "checking",
      mask: "0000",
      balance: bankBalance,
      is_primary: 1,
    });
  }
  const transactions = all("SELECT * FROM bank_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 60", user.id);
  const roundupVault = get<{ id: string; name: string }>(
    "SELECT id, name FROM vaults WHERE user_id = ? AND rule_type = 'roundup' AND status = 'locked' ORDER BY created_at LIMIT 1",
    user.id,
  );
  const byCategory = all<{ category: string; total: number }>(
    "SELECT category, SUM(amount) AS total FROM bank_transactions WHERE user_id = ? AND direction = 'debit' AND created_at > ? GROUP BY category ORDER BY total DESC",
    user.id,
    Date.now() - 30 * 86_400_000,
  );
  return json({ accounts, transactions, roundups: pendingRoundups(user), roundupVault, spendByCategory: byCategory, currency: user.currency });
});
