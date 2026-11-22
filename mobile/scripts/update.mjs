// Publishes an over-the-air update to installed builds on one channel.
//   npm run update:apk -- "Fix the vault screen"
//   npm run update:production -- "Fix the vault screen"
// Only code and design changes travel this way. A new native package, permission or icon needs a new build;
// the fingerprint runtime version keeps an update away from builds that can't run it.
import { execSync, spawnSync } from "node:child_process";

const CHANNELS = {
  // channel: the EAS environment it reads, and whether the app must stay Practice only.
  apk: { environment: "preview", practiceOnly: true },
  production: { environment: "production", practiceOnly: true },
  preview: { environment: "preview", practiceOnly: false },
};

const [channel, ...words] = process.argv.slice(2);
const target = CHANNELS[channel];
if (!target) {
  console.error(`Choose a channel: ${Object.keys(CHANNELS).join(", ")}`);
  process.exit(1);
}

const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
const commit = git("rev-parse --short HEAD");
const message = words.join(" ").trim() || git("log -1 --pretty=%s") || "Update";
// An update should match a commit, so it can be traced and rolled back.
if (git("status --porcelain -- .")) console.warn("Note: mobile/ has uncommitted changes. They will be included in this update.\n");

const run = spawnSync(
  "npx",
  ["eas-cli@latest", "update", "--channel", channel, "--environment", target.environment, "--message", JSON.stringify(`${message} (${commit || "no commit"})`)],
  {
    stdio: "inherit",
    shell: true,
    // Practice-only builds also check their channel at run time (src/lib/build.ts); this keeps the bundle consistent.
    env: { ...process.env, ...(target.practiceOnly ? { EXPO_PUBLIC_PRACTICE_ONLY: "1" } : {}) },
  },
);
process.exit(run.status ?? 1);
