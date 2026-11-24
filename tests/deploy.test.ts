import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * deploy/: root must only ever run root-owned copies of the scripts. /opt/vaultwise belongs to the app user
 * ("vaultwise"), and `npm ci` runs package install scripts as that user, so a file there may have been changed.
 */

const read = (f: string) => fs.readFileSync(path.join(__dirname, "..", "deploy", f), "utf8");
/** Lines that run something (not comments, not echoed text). */
const commands = (src: string) =>
  src
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("echo "));

describe("deploy scripts run as root only from root-owned copies", () => {
  it("installs update.sh and backup.sh to /usr/local/sbin as root, and schedules the installed backup", () => {
    const readme = read("README.md");
    expect(readme).toContain("sudo install -o root -g root -m 0755 /opt/vaultwise/deploy/update.sh /usr/local/sbin/vaultwise-update");
    expect(readme).toContain("sudo install -o root -g root -m 0755 /opt/vaultwise/deploy/backup.sh /usr/local/sbin/vaultwise-backup");
    expect(readme).toContain("30 21 * * * root /usr/local/sbin/vaultwise-backup");
    expect(readme).toContain("sudo vaultwise-update");
    // No step tells root to run a file from the app folder.
    expect(readme).not.toMatch(/sudo bash \/opt\/vaultwise\/deploy\/\w+\.sh(?! \.\.\.)/);
    expect(readme).not.toMatch(/root \/usr\/bin\/bash \/opt\/vaultwise/);
    expect(read("restore.md")).toContain("/usr/local/sbin/vaultwise-backup");
  });

  it("update.sh builds as the app user and never installs deploy files by itself", () => {
    const src = read("update.sh");
    const run = commands(src);
    expect(run.some((l) => l.includes(`as_app "set -a`) && l.includes("npm ci"))).toBe(true);
    // It shows a difference and prints the install command; it never runs install or cp on deploy files.
    expect(run.some((l) => /^(sudo\s+)?(install|cp)\s/.test(l))).toBe(false);
    expect(src).toContain('diff -u "$installed" "$repo" | cat -v');
    expect(src).toContain("/usr/local/sbin/vaultwise-backup");
  });

  it("backup.sh documents the root-owned copy and takes the S3 bucket as a setting", () => {
    const src = read("backup.sh");
    expect(src).toContain("30 21 * * * root /usr/local/sbin/vaultwise-backup");
    expect(src).toContain("BACKUP_S3_URI");
    expect(commands(src).some((l) => l.includes("YOUR-BUCKET-NAME"))).toBe(false);
  });
});
