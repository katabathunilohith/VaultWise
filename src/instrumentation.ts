/**
 * Runs once when a Next.js server starts (`next start`, `next dev`), and must finish before it serves any
 * request. Next.js skips it during `next build`. See node_modules/next/dist/docs/01-app/02-guides/instrumentation.md.
 *
 * Plan 05: a production server without sign-in configured stops here with a clear message instead of
 * serving the open prototype. The rule itself is `productionStartupProblem()` in src/lib/auth/config.ts;
 * the Node-only check is in src/instrumentation-node.ts, imported only on the Node runtime.
 *
 * audit-anchors: then one audit anchor per start (src/lib/audit-anchors); the scheduler adds one a day.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkProductionStartup, anchorAuditAtStartup } = await import("./instrumentation-node");
  checkProductionStartup();
  anchorAuditAtStartup(); // audit-anchors
}
