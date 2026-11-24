// Publishes an over-the-air update to installed builds on one channel.
//   npm run update:apk -- "Fix the vault screen"
//   npm run update:production -- "Fix the vault screen"
//   node scripts/update.mjs tester-live "Fix the vault screen"   (the online tester build, plan 05)
// Only code and design changes travel this way. A new native package, permission or icon needs a new build;
// the fingerprint runtime version keeps an update away from builds that can't run it.
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";

const CHANNELS = {
  // channel: the EAS environment it reads, whether the app must stay Practice only, and (profile) the
  // eas.json build profile whose EXPO_PUBLIC_ values the update must carry again.
  apk: { environment: "preview", practiceOnly: true },
  production: { environment: "production", practiceOnly: true },
  preview: { environment: "preview", practiceOnly: false },
  // Live data and sign-in against the online server (EXPO_PUBLIC_API_URL from its build profile).
  "tester-live": { environment: "preview", practiceOnly: false, profile: "tester-live" },
};

const [channel, ...words] = process.argv.slice(2);
const target = CHANNELS[channel];
if (!target) {
  console.error(`Choose a channel: ${Object.keys(CHANNELS).join(", ")}`);
  process.exit(1);
}

/**
 * An update is bundled here, not by the build, so a build profile's `env` (eas.json) doesn't reach it on its
 * own. Carry the profile's EXPO_PUBLIC_ values (they are baked into the bundle), unless already set here.
 */
function profileEnv(profile) {
  if (!profile) return {};
  const env = JSON.parse(fs.readFileSync(new URL("../eas.json", import.meta.url), "utf8")).build?.[profile]?.env ?? {};
  const out = Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith("EXPO_PUBLIC_") && !process.env[k]));
  const url = process.env.EXPO_PUBLIC_API_URL ?? out.EXPO_PUBLIC_API_URL;
  if (!url || /YOUR-DOMAIN/i.test(url)) {
    console.error(`The ${profile} channel talks to the online server: set EXPO_PUBLIC_API_URL in eas.json (build.${profile}.env) or in this shell first.`);
    process.exit(1);
  }
  return out;
}
const extraEnv = profileEnv(target.profile);

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
    env: { ...process.env, ...extraEnv, ...(target.practiceOnly ? { EXPO_PUBLIC_PRACTICE_ONLY: "1" } : {}) },
  },
);
process.exit(run.status ?? 1);
