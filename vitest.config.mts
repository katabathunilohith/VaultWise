import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    pool: "forks",
    testTimeout: 30_000,
    // The Expo app in mobile/ has its own test setup.
    exclude: [...configDefaults.exclude, "mobile/**"],
  },
});
