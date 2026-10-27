import { z } from "zod";

/** Request bodies for the wallet routes. Amounts are major units; responses are minor units. */
export const Amount = z.number().positive().max(100_000_000);

export const TopUpBody = z.object({ amount: Amount });
export const MoveBody = z.object({ vaultId: z.string().trim().min(1), amount: Amount });
export const SpendBody = z.object({
  amount: Amount,
  payee: z.string().trim().min(2).max(80),
  note: z.string().trim().max(200).nullable().optional(),
});
export const CashOutBody = z.object({ amount: Amount });
export const SettingsBody = z.object({
  /** Major units a day; null turns the limit off. */
  dailyLimit: Amount.nullable().optional(),
  autoSaveSource: z.enum(["bank", "wallet"]).optional(),
});
