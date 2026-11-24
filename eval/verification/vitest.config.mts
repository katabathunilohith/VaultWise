import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Runs the verification evaluation (not a test suite): `npm run eval:verification` spawns this once per
 * configuration. The root `npx vitest run` never picks it up (the file is *.eval.ts, not *.test.ts).
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  test: {
    root: fileURLToPath(new URL("../..", import.meta.url)),
    include: ["eval/verification/evaluate.eval.ts"],
    setupFiles: ["eval/verification/setup.ts"],
    environment: "node",
    pool: "forks",
    // A live pass sends ~50 bills to Groq with a pause between them.
    testTimeout: 3 * 60 * 60 * 1000,
  },
});
