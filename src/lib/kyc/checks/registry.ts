import { assertTestChecksAllowed, checksProviderName } from "./config";
import { setuProviders } from "./providers/setu";
import { testProviders } from "./providers/test";
import type { CheckProviders, CheckStep } from "./types";

/**
 * Picks the providers for the three checks. KYC_CHECKS_PROVIDER chooses the set; tests (or a future
 * per-check switch) can replace any one of them. Adding a provider: write providers/<name>.ts that
 * satisfies CheckProviders, add it here, and set the env var.
 */

const SETS = { test: testProviders, setu: setuProviders } as const;
let override: Partial<CheckProviders> | null = null;

/** Tests swap providers here. Pass null to use KYC_CHECKS_PROVIDER again. */
export function setCheckProviders(p: Partial<CheckProviders> | null) {
  override = p;
}

function chosenProviders(): CheckProviders {
  return { ...SETS[checksProviderName()], ...(override ?? {}) };
}

/**
 * Which provider runs each step now, by name, without the production check (read-only: the KYC view uses
 * it so a step finished with another provider, such as the test provider's sample data, doesn't count).
 */
export function currentProviderNames(): Record<CheckStep, string> {
  const p = chosenProviders();
  return { pan: p.pan.name, aadhaar: p.digilocker.name, bank: p.bank.name };
}

export function checkProviders(): CheckProviders {
  const chosen = chosenProviders();
  // The test provider verifies anyone with its sample PAN: refuse it on production servers unless allowed.
  if (Object.values(chosen).some((p) => p === testProviders.pan || p === testProviders.digilocker || p === testProviders.bank)) assertTestChecksAllowed();
  return chosen;
}
