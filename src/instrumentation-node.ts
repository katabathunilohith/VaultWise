import { productionStartupProblem, productionStartupWarnings } from "./lib/auth/config";

/**
 * The Node-only half of src/instrumentation.ts. It lives in its own file so the Edge build never sees
 * `process.exit` (Next.js compiles instrumentation for both runtimes and warns otherwise).
 */
export function checkProductionStartup() {
  const problem = productionStartupProblem();
  if (problem) {
    console.error(`\n${problem}\n`);
    // Exit rather than throw, so the process really stops (and systemd sees the failure) whatever Next.js does with a failed hook.
    process.exit(1);
  }
  for (const warning of productionStartupWarnings()) console.warn(`[vaultwise] ${warning}`);
}
