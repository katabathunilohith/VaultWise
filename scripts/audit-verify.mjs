/**
 * Checks the audit chain against its anchors (src/lib/audit-anchors/README.md):
 *
 *   npm run audit:verify                                   # this server's database and anchors file
 *   npm run audit:verify -- --db <copy>/vaultwise.db --anchors <copy>/audit-anchors.jsonl
 *
 * Re-walks every hash from a read-only copy of the database and compares it with every anchor; exits 1 on any
 * mismatch. It runs the app's own TypeScript (src/lib/audit-anchors/cli.ts) through Node's built-in type
 * stripping, with a resolve hook for the extension-less imports the app uses. Needs Node 22.18 or later (the
 * server runs 24). On the server, run it as the app user, never as root (deploy/README.md).
 */
import { registerHooks } from "node:module";

if (typeof registerHooks !== "function") {
  console.error(`audit:verify needs Node 22.18 or later (this is ${process.version}).`);
  process.exit(2);
}

const SRC = new URL("../src/", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    // The app's "@/..." alias (tsconfig paths).
    if (specifier.startsWith("@/")) specifier = new URL(specifier.slice(2), SRC).href;
    try {
      return nextResolve(specifier, context);
    } catch (e) {
      const relative = specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("file:");
      if (relative && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw e;
    }
  },
});

const { auditVerify } = await import("../src/lib/audit-anchors/cli.ts");
process.exitCode = auditVerify(process.argv.slice(2));
