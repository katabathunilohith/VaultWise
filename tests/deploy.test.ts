import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * deploy/: root must only ever run root-owned copies of the scripts. /opt/vaultwise belongs to the app user
 * ("vaultwise"), and `npm install` runs package install scripts as that user, so a file there may have been changed.
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
    expect(run.some((l) => l.includes(`as_app "set -a`) && l.includes("npm install") && l.includes("git checkout -- package-lock.json"))).toBe(true);
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

describe("audit anchors in the deploy files (security review gap 15)", () => {
  it("backup.sh copies the anchors before the database, so the S3 copy and a restore get a matching pair", () => {
    const run = commands(read("backup.sh"));
    const copyAnchors = run.findIndex((l) => l.startsWith('cp "$ANCHORS" "$DEST/audit-anchors.jsonl"'));
    const backupDb = run.findIndex((l) => l.includes(".backup '$DEST/vaultwise.db'"));
    const s3 = run.findIndex((l) => l.includes('s3 cp --recursive "$DEST"'));
    expect(copyAnchors).toBeGreaterThanOrEqual(0);
    expect(copyAnchors).toBeLessThan(backupDb);
    expect(s3).toBeGreaterThan(copyAnchors); // the whole backup folder, anchors included
    expect(run).toContain('ANCHORS="${AUDIT_ANCHOR_FILE:-$DATA_DIR/audit-anchors.jsonl}"');
  });

  it("backup.sh checks the newest anchor without running app code, and only with validated values", () => {
    const src = read("backup.sh");
    const run = commands(src);
    expect(run.some((l) => /(^|[;&|]\s*|\$\()(sudo\s+)?(npm|node|npx)\s/.test(l))).toBe(false);
    // The anchors file is writable by the app user: only digits and a 64-character hex hash reach sqlite3.
    expect(src).toContain(String.raw`sed -n 's/.*"lastId":\([0-9][0-9]*\).*/\1/p'`);
    expect(src).toContain(String.raw`sed -n 's/.*"headHash":"\([0-9a-f]\{64\}\)".*/\1/p'`);
    expect(src).toContain("AUDIT ANCHOR MISMATCH");
  });

  it("README and restore.md run the checker as the app user, never as root, and restore the matching anchors", () => {
    const readme = read("README.md");
    const restore = read("restore.md");
    for (const doc of [readme, restore]) {
      expect(doc).toContain("npm run audit:verify");
      for (const line of doc.split("\n").filter((l) => l.includes("npm run audit:verify") && l.trim().startsWith("sudo")))
        expect(line).toMatch(/^\s*sudo -u vaultwise -H bash -c 'cd \/opt\/vaultwise && /);
    }
    expect(restore).toContain("sudo cp $B/audit-anchors.jsonl /var/lib/vaultwise/audit-anchors.jsonl");
    expect(restore).toContain("/var/backups/vaultwise/$LATEST/audit-anchors.jsonl");
  });
});
