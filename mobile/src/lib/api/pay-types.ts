import type { Millis, Minor, Stage, VaultCategory } from "./types";

/**
 * Pay with Vaultwise — the merchant checkout from the build plan
 * (https://claude.ai/artifact/P3eQwo5ouAukmUUyvjatk7). The server side
 * (`/api/v1/pay/*`) is Phase 1 of that plan and isn't built yet, so the app
 * simulates it and marks the payment `simulated` until those routes exist. In a
 * live session the simulation is a dry run against the customer's real vaults
 * (`dryRun`): their balances are checked, never moved.
 */
export type IntentStatus = "requires_customer" | "processing" | "in_review" | "succeeded" | "declined" | "expired" | "cancelled";

export interface PaymentIntent {
  id: string;
  merchant: { id: string; name: string; category: VaultCategory; city?: string };
  amount: Minor;
  currency: string;
  category: VaultCategory;
  description: string;
  reference: string;
  lineItems: { description: string; amount: Minor }[];
  status: IntentStatus;
  createdAt: Millis;
  expiresAt: Millis;
  eligibleVaults: { id: string; name: string; category: VaultCategory; available: Minor }[];
  vaultId?: string | null;
  stages?: Stage[];
  decisionReason?: string | null;
  simulated: boolean;
  /**
   * Set by the app, never by the server: a live session simulating checkout while /pay isn't
   * deployed. The vaults and balances are the customer's real ones, but nothing is paid, debited
   * or held, so screens must not say money moved.
   */
  dryRun?: boolean;
}
