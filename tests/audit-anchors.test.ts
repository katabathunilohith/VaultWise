import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { all, get, run } from "@/lib/db";
import { audit, auditHead, GENESIS, verifyAuditChain, type AuditRow } from "@/lib/audit";
import { createUser } from "@/lib/users";
import { tick } from "@/lib/scheduler";
import {
  ANCHOR_EVERY_MS,
  anchorAuditChain,
  anchorAuditIfDue,
  anchorFile,
  checkAnchors,
  lastAnchorAt,
  parseAnchors,
  type AuditAnchor,
} from "@/lib/audit-anchors";
import { auditVerify } from "@/lib/audit-anchors/cli";

/** Security review gap 15: the audit chain's head is anchored outside the database, and `npm run audit:verify` checks it. */

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vaultwise-anchors-"));
const dbFile = path.join(process.env.VAULTWISE_DATA_DIR!, "vaultwise.db");
let n = 0;
/** A fresh anchors file per test. */
beforeEach(() => {
  process.env.AUDIT_ANCHOR_FILE = path.join(scratch, `anchors-${++n}.jsonl`);
});
afterAll(() => {
  delete process.env.AUDIT_ANCHOR_FILE;
  vi.restoreAllMocks();
});
const quiet = () => vi.spyOn(console, "log").mockImplementation(() => {});
const lines = () => fs.readFileSync(anchorFile(), "utf8").trim().split("\n");
const row = (action: string) => audit({ actor: "test", actorType: "system", action });
const verify = (...args: string[]) => {
  const out: string[] = [];
  const code = auditVerify(args, (l) => out.push(l));
  return { code, out: out.join("\n") };
};
/** A consistent copy of the test database (the live one is in WAL mode). */
function copyDb(name: string) {
  const file = path.join(scratch, name);
  run(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  return file;
}
/** The server's hash rule, as an attacker with database access would recompute it. */
const rehash = (prev: string, r: AuditRow) =>
  crypto
    .createHash("sha256")
    .update(prev)
    .update(JSON.stringify([r.ts, r.user_id, r.actor, r.actor_type, r.action, r.entity_type, r.entity_id, r.details]))
    .digest("hex");

describe("writing anchors", () => {
  it("appends the chain's head as one JSON line, and prints the same line for the journal", () => {
    const log = quiet();
    row("test.one");
    row("test.two");
    const a = anchorAuditChain({ now: 1_000 });
    expect(a).toEqual({ ts: 1_000, ...auditHead() });
    expect(a.count).toBe(get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log")!.n);
    expect(a.headHash).toBe(verifyAuditChain().headHash);
    expect(lines()).toEqual([JSON.stringify(a)]);
    expect(log).toHaveBeenCalledWith(`[vaultwise] audit_anchor ${JSON.stringify(a)}`);
    anchorAuditChain({ now: 2_000 });
    expect(lines()).toHaveLength(2); // appended, never rewritten
  });

  it("is due once a day, reading the last anchor from the file after a restart", () => {
    quiet();
    const t0 = Date.now();
    expect(lastAnchorAt()).toBeNull();
    expect(anchorAuditIfDue(t0)).not.toBeNull();
    expect(anchorAuditIfDue(t0 + ANCHOR_EVERY_MS - 1)).toBeNull();
    // A restart forgets the in-memory time; the file still says when the last one was.
    globalThis.__vaultwiseAnchorAt = undefined;
    expect(lastAnchorAt()).toBe(t0);
    expect(anchorAuditIfDue(t0 + ANCHOR_EVERY_MS)).not.toBeNull();
    expect(lines()).toHaveLength(2);
  });

  it("runs from the scheduler's tick", async () => {
    quiet();
    const u = createUser({ name: "Tick Tock", jurisdiction: "US", pin: "482915" });
    await tick(u);
    await tick(u);
    expect(lines()).toHaveLength(1);
  });

  it("never breaks the caller when the file can't be written", () => {
    process.env.AUDIT_ANCHOR_FILE = scratch; // a folder, not a file
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(anchorAuditIfDue(Date.now() + 10 * ANCHOR_EVERY_MS)).toBeNull();
    expect(err).toHaveBeenCalledWith("[vaultwise] audit_anchor_failed", expect.anything());
  });
});

describe("checking anchors (pure)", () => {
  const rows = [
    { id: 1, hash: "a".repeat(64) },
    { id: 2, hash: "b".repeat(64) },
    { id: 4, hash: "c".repeat(64) },
  ];
  const at = (lastId: number, headHash: string, count: number, ts = 1): AuditAnchor => ({ ts, lastId, headHash, count });

  it("passes anchors that match, including one of the empty chain", () => {
    expect(checkAnchors(rows, [at(0, GENESIS, 0), at(2, "b".repeat(64), 2), at(4, "c".repeat(64), 3)])).toEqual([]);
  });

  it("catches a changed hash, a missing row, a wrong count and anchors going backwards", () => {
    expect(checkAnchors(rows, [at(2, "f".repeat(64), 2)])[0]).toMatch(/row 2 has hash b{12}…, the anchor says f{12}…/);
    expect(checkAnchors(rows, [at(9, "c".repeat(64), 4)])[0]).toMatch(/row 9 is missing \(the database ends at row 4\)/);
    expect(checkAnchors(rows, [at(4, "c".repeat(64), 4)])[0]).toMatch(/3 rows up to row 4, the anchor says 4/);
    expect(checkAnchors(rows, [at(4, "c".repeat(64), 3), at(2, "b".repeat(64), 2)])[0]).toMatch(/goes backwards/);
    expect(checkAnchors(rows, [at(3, GENESIS, 0)])[0]).toMatch(/empty but names row 3/);
  });

  it("reads the file's lines and the journal's, and reports anything else", () => {
    const a = at(2, "b".repeat(64), 2);
    const text = [
      JSON.stringify(a),
      "",
      `Nov 24 03:00:00 host npm[123]: [vaultwise] audit_anchor ${JSON.stringify(a)}`,
      "garbage",
      JSON.stringify({ ...a, headHash: "not-a-hash" }),
    ].join("\n");
    const parsed = parseAnchors(text);
    expect(parsed.anchors).toEqual([
      { ...a, line: 1 },
      { ...a, line: 3 },
    ]);
    expect(parsed.problems).toEqual(["line 4: not JSON", "line 5: not an anchor ({ ts, lastId, headHash, count })"]);
  });
});

describe("npm run audit:verify", () => {
  it("passes an intact chain against its anchors, from a read-only copy", () => {
    quiet();
    row("test.before");
    anchorAuditChain();
    row("test.after"); // rows after the newest anchor are fine
    anchorAuditChain();
    row("test.later");
    const r = verify("--db", dbFile, "--anchors", anchorFile());
    expect(r.out).toMatch(/OK: the chain is intact and matches every anchor\./);
    expect(r.code).toBe(0);
  });

  it("fails a chain someone rebuilt after an anchor, even though its hashes are consistent", () => {
    quiet();
    row("test.original");
    const anchor = anchorAuditChain();
    const copy = copyDb("rebuilt.db");
    const d = new DatabaseSync(copy);
    d.exec("DROP TRIGGER audit_no_update");
    const rows = d.prepare("SELECT * FROM audit_log ORDER BY id").all() as unknown as AuditRow[];
    // Rewrite one early row's details and recompute every hash after it.
    const target = rows[Math.floor(rows.length / 2)].id;
    let prev = GENESIS;
    for (const r of rows) {
      const changed = r.id === target ? { ...r, details: JSON.stringify({ forged: true }) } : r;
      const hash = rehash(prev, changed);
      d.prepare("UPDATE audit_log SET details = ?, prev_hash = ?, hash = ? WHERE id = ?").run(changed.details, prev, hash, r.id);
      prev = hash;
    }
    d.close();

    const r = verify("--db", copy, "--anchors", anchorFile());
    expect(r.code).toBe(1);
    expect(r.out).not.toMatch(/the chain is broken/); // the walk alone can't see it
    expect(r.out).toMatch(new RegExp(`MISMATCH: line 1, anchor of .*: row ${anchor.lastId} has hash`));
  });

  it("fails a chain edited in place, an unreadable anchors file, and a missing one", () => {
    quiet();
    row("test.x");
    anchorAuditChain();
    const copy = copyDb("edited.db");
    const d = new DatabaseSync(copy);
    d.exec("DROP TRIGGER audit_no_update");
    d.prepare("UPDATE audit_log SET details = '{\"forged\":true}' WHERE id = 1").run();
    d.close();
    const edited = verify("--db", copy, "--anchors", anchorFile());
    expect(edited.code).toBe(1);
    expect(edited.out).toMatch(/the chain is broken at row 1/);

    fs.appendFileSync(anchorFile(), "not json\n");
    expect(verify("--db", dbFile, "--anchors", anchorFile()).out).toMatch(/MISMATCH: line 2: not JSON/);
    const missing = verify("--db", dbFile, "--anchors", path.join(scratch, "nope.jsonl"));
    expect(missing.code).toBe(1);
    expect(missing.out).toMatch(/no anchors file/);
  });

  it("says when it can't run", () => {
    expect(verify("--db", path.join(scratch, "missing.db")).code).toBe(2);
    expect(verify("--bogus").code).toBe(2);
  });

  it("runs as a script with plain Node, and exits non-zero on a mismatch", () => {
    quiet();
    row("test.script");
    anchorAuditChain();
    const copy = copyDb("script.db");
    const script = path.join(__dirname, "..", "scripts", "audit-verify.mjs");
    const flags = ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--disable-warning=ExperimentalWarning"];
    const ok = spawnSync(process.execPath, [...flags, script, "--db", copy, "--anchors", anchorFile()], { encoding: "utf8" });
    expect(ok.stderr).toBe("");
    expect(ok.stdout).toMatch(/OK: the chain is intact/);
    expect(ok.status).toBe(0);

    const forged = path.join(scratch, "forged.jsonl");
    const head = auditHead();
    fs.writeFileSync(forged, `${JSON.stringify({ ts: 1, lastId: head.lastId, headHash: "0".repeat(63) + "1", count: head.count })}\n`);
    const bad = spawnSync(process.execPath, [...flags, script, "--db", copy, "--anchors", forged], { encoding: "utf8" });
    expect(bad.stdout).toMatch(/MISMATCH/);
    expect(bad.status).toBe(1);
  }, 30_000);

  it("has a package.json script", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    expect(pkg.scripts["audit:verify"]).toMatch(/scripts\/audit-verify\.mjs$/);
    expect(all("SELECT 1 FROM audit_log LIMIT 1")).toHaveLength(1);
  });
});
