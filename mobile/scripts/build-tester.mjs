// npm run build:tester: the public test site. Practice only, with the tester card and activity sharing on.
// Writes dist/. Publish it with `npx eas-cli@latest deploy --prod`.
import { spawnSync } from "node:child_process";
import fs from "node:fs";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim()) {
  console.error("No PostHog key. Put your project API key in mobile/.env.local as EXPO_PUBLIC_POSTHOG_KEY=...");
  process.exit(1);
}

const run = spawnSync("npx", ["expo", "export", "--platform", "web"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_PRACTICE_ONLY: "1", EXPO_PUBLIC_TESTER: "1" },
});
process.exit(run.status ?? 1);
