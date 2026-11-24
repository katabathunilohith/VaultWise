// Metrics and the results page for the verification evaluation (used by run.mjs).
// docs/evaluation/verification-results.json keeps the latest offline and the latest live run side by side;
// the markdown page is re-rendered from it, so an offline run never erases the last live numbers.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const CLASSES = ["genuine", "edited", "duplicate", "wrong-purpose", "stale"];
export const OUTCOMES = ["approve", "decline", "review"];
const CONFIG_TITLES = {
  stub: "Offline · oracle reader",
  "no-ai": "Offline · no AI (customer said no)",
  live: "Live · Groq vision model",
  "live-read": "Live · only bills the AI read",
};

const pct = (k, n) => (n ? `${Math.round((100 * k) / n)}%` : "–");
const frac = (k, n) => `${k}/${n} (${pct(k, n)})`;

/** Same decisions, confidences, reasons and failed/warned checks give the same fingerprint (used for the refactor check). */
export function fingerprint(items) {
  const canon = items.map((i) => [i.id, i.actual, i.confidence, i.reasons, i.checks]);
  return crypto.createHash("sha256").update(JSON.stringify(canon)).digest("hex").slice(0, 16);
}

export function computeMetrics(items) {
  const byClass = {};
  for (const c of CLASSES) {
    const its = items.filter((i) => i.class === c);
    const row = { n: its.length, expected: its[0]?.expected ?? null, correct: its.filter((i) => i.correct).length };
    for (const o of OUTCOMES) row[o] = its.filter((i) => i.actual === o).length;
    byClass[c] = row;
  }
  const matrix = {};
  for (const e of OUTCOMES) {
    matrix[e] = {};
    for (const a of OUTCOMES) matrix[e][a] = items.filter((i) => i.expected === e && i.actual === a).length;
  }
  const genuine = items.filter((i) => i.class === "genuine");
  const bad = items.filter((i) => i.class !== "genuine");
  const count = (list, o) => list.filter((i) => i.actual === o).length;
  return {
    n: items.length,
    correct: items.filter((i) => i.correct).length,
    accuracy: items.length ? items.filter((i) => i.correct).length / items.length : 0,
    genuine: { n: genuine.length, approve: count(genuine, "approve"), decline: count(genuine, "decline"), review: count(genuine, "review") },
    bad: { n: bad.length, approve: count(bad, "approve"), decline: count(bad, "decline"), review: count(bad, "review") },
    falseDeclineRate: genuine.length ? count(genuine, "decline") / genuine.length : 0,
    falseApproveRate: bad.length ? count(bad, "approve") / bad.length : 0,
    reviewRate: items.length ? count(items, "review") / items.length : 0,
    falseApprovals: bad.filter((i) => i.actual === "approve").map((i) => i.id),
    falseDeclines: genuine.filter((i) => i.actual === "decline").map((i) => i.id),
    aiFailures: items.filter((i) => i.ai?.problem).map((i) => i.id),
    byClass,
    matrix,
    fingerprint: fingerprint(items),
  };
}

/** Merges this run into the stored results and rewrites the JSON and the markdown page. */
export function updateResults({ docsDir, mode, raws, commit, runAt }) {
  const jsonPath = path.join(docsDir, "verification-results.json");
  const store = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, "utf8")) : {};
  store[mode] = {
    runAt,
    commit,
    configs: Object.fromEntries(
      raws.map((raw) => {
        const { items, ...meta } = raw;
        return [raw.config, { ...meta, metrics: computeMetrics(items), items }];
      }),
    ),
  };
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(store, null, 2)}\n`);
  fs.writeFileSync(path.join(docsDir, "verification-results.md"), renderMarkdown(store));
  return store;
}

export function headlineRows(store) {
  const runs = [];
  for (const mode of ["offline", "live"])
    for (const [config, run] of Object.entries(store[mode]?.configs ?? {})) {
      runs.push({ mode, config, run });
      // When the provider failed on some bills (e.g. the daily limit), also show the bills the model actually read.
      if (config === "live" && run.metrics.aiFailures.length) runs.push({ mode, config: "live-read", run: { metrics: computeMetrics(run.items.filter((i) => !i.ai?.problem)) } });
    }
  const row = (label, f) => `| ${label} | ${runs.map(f).join(" | ")} |`;
  return {
    runs,
    lines: [
      `| | ${runs.map((r) => CONFIG_TITLES[r.config] ?? r.config).join(" | ")} |`,
      `|---|${runs.map(() => "---").join("|")}|`,
      row("Run", (r) => `${store[r.mode].runAt.slice(0, 10)} · \`${store[r.mode].commit}\``),
      row("Bills", (r) => r.run.metrics.n),
      row("Decision as expected", (r) => frac(r.run.metrics.correct, r.run.metrics.n)),
      row("Genuine approved", (r) => frac(r.run.metrics.genuine.approve, r.run.metrics.genuine.n)),
      row("**False declines** (genuine declined)", (r) => frac(r.run.metrics.genuine.decline, r.run.metrics.genuine.n)),
      row("**False approvals** (bad bill approved)", (r) => frac(r.run.metrics.bad.approve, r.run.metrics.bad.n)),
      row("Bad bills declined", (r) => frac(r.run.metrics.bad.decline, r.run.metrics.bad.n)),
      row("Sent to a person", (r) => frac(Math.round(r.run.metrics.reviewRate * r.run.metrics.n), r.run.metrics.n)),
      row("AI read failed", (r) => (r.config === "live" ? r.run.metrics.aiFailures.length : r.config === "live-read" ? 0 : "n/a")),
      row("Fingerprint", (r) => `\`${r.run.metrics.fingerprint}\``),
    ],
  };
}

function cut(s, n) {
  const t = String(s ?? "").replace(/\|/g, "/").replace(/\s+/g, " ");
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function renderRun(mode, config, run, store) {
  const m = run.metrics;
  const out = [];
  out.push(`## ${CONFIG_TITLES[config] ?? config}`, "");
  out.push(
    `- Run ${run.startedAt.replace("T", " ").slice(0, 16)} UTC · commit \`${store[mode].commit}\` · pipeline \`${run.pipelineVersion}\``,
    `- Reader: ${run.reader}${config === "live" ? ` · ${run.delayMs / 1000}s pause between bills` : ""}`,
    `- Market ${run.market}: approve at ≥ ${run.thresholds.autoApprove}, decline at ≤ ${run.thresholds.autoDeny}, documents up to ${run.maxDocAgeDays} days old`,
    `- Dataset generated for ${run.datasetDate}, seed \`0x${run.seed.toString(16)}\` · fingerprint \`${m.fingerprint}\``,
    "",
  );
  const classTable = (title, metrics) => {
    out.push(title, "", "| Class | Expected | n | approve | decline | review | as expected |", "|---|---|---|---|---|---|---|");
    for (const c of CLASSES) {
      const r = metrics.byClass[c];
      if (!r.n) continue;
      out.push(`| ${c} | ${r.expected} | ${r.n} | ${pct(r.approve, r.n)} (${r.approve}) | ${pct(r.decline, r.n)} (${r.decline}) | ${pct(r.review, r.n)} (${r.review}) | ${frac(r.correct, r.n)} |`);
    }
  };
  classTable("### Decisions by class", m);
  if (config === "live" && m.aiFailures.length) {
    const first = run.items.find((i) => i.ai?.problem);
    out.push("", `The model's answer was missing for ${m.aiFailures.length} bills (${first.ai.problem}, from bill ${run.items.indexOf(first) + 1} on). Those went to a person, or were declined on a hard fail that doesn't need the model (exact duplicate, ELA), so the table above mixes both. The bills the model did read:`, "");
    classTable("#### Decisions by class, bills the AI read", computeMetrics(run.items.filter((i) => !i.ai?.problem)));
  }
  out.push("", "### Expected vs actual decision", "", "| expected ↓ / actual → | approve | decline | review |", "|---|---|---|---|");
  for (const e of OUTCOMES) out.push(`| ${e} | ${OUTCOMES.map((a) => (e === a ? `**${m.matrix[e][a]}**` : m.matrix[e][a])).join(" | ")} |`);
  out.push(
    "",
    `False declines: ${m.falseDeclines.length ? m.falseDeclines.map((i) => `\`${i}\``).join(", ") : "none"}. False approvals: ${m.falseApprovals.length ? m.falseApprovals.map((i) => `\`${i}\``).join(", ") : "none"}.${config === "live" ? ` AI read failed on: ${m.aiFailures.length ? m.aiFailures.map((i) => `\`${i}\``).join(", ") : "none"}.` : ""}`,
    "",
  );
  out.push(
    "### Per bill",
    "",
    `In processing order. ELA = error-level-analysis score ("inconcl." = the image re-compresses unchanged, so ELA is ignored). T = combined tamper score; at ≥ 0.8 it declines (from \`vw-proof@1.5\`: only with a signal other than ELA, and never for a customer who asked for a person).`,
    "",
  );
  if (config === "live") {
    out.push("| # | Bill | Class | Expected | Actual | Conf. | ELA / T | What the AI read | Why |", "|---|---|---|---|---|---|---|---|---|");
  } else {
    out.push("| # | Bill | Class | Expected | Actual | Conf. | ELA / T | Why |", "|---|---|---|---|---|---|---|---|");
  }
  run.items.forEach((i, k) => {
    const mark = i.correct ? i.actual : `**${i.actual}** ✗`;
    const why = cut(i.reasons.slice(0, 2).join(" · "), 170);
    const sig = `${i.signals.elaInconclusive ? "inconcl." : (i.signals.ela ?? "–")} / ${i.signals.tamper ?? "–"}`;
    if (config === "live") {
      const a = i.ai?.problem
        ? `failed: ${i.ai.problem}`
        : i.ai?.read
          ? `${i.ai.read.documentType}, ${i.ai.read.date ?? "no date"}, ${i.ai.read.total ?? "no total"}, fit ${Number(i.ai.read.categoryForVault ?? 0).toFixed(2)}, ${i.ai.read.editingSigns?.length ?? 0} edit sign(s)`
          : "–";
      out.push(`| ${k + 1} | \`${i.id}\` | ${i.class} | ${i.expected} | ${mark} | ${i.confidence ?? "–"} | ${sig} | ${cut(a, 90)} | ${why} |`);
    } else {
      out.push(`| ${k + 1} | \`${i.id}\` | ${i.class} | ${i.expected} | ${mark} | ${i.confidence ?? "–"} | ${sig} | ${why} |`);
    }
  });
  out.push("");
  return out.join("\n");
}

export function renderMarkdown(store) {
  const { lines } = headlineRows(store);
  const parts = [
    "# Verification evaluation: results",
    "",
    "> Written by `npm run eval:verification` (offline) and `npm run eval:verification -- --live`. Do not edit by hand: re-run instead. Method, classes and limits: [README.md](README.md). Every number, check and reason: [verification-results.json](verification-results.json).",
    "",
    "Expected decisions: genuine → approve; edited, duplicate and wrong-purpose → decline; stale (older than the market's limit) → review, because a failed date check sends a bill to a person by design. A *false decline* is a genuine bill declined automatically; a *false approval* is any non-genuine bill approved automatically.",
    "",
    "## Headline",
    "",
    ...lines,
    "",
  ];
  const offlineVersion = Object.values(store.offline?.configs ?? {})[0]?.pipelineVersion;
  const liveVersion = store.live?.configs?.live?.pipelineVersion;
  if (offlineVersion && liveVersion && offlineVersion !== liveVersion) {
    parts.push(
      `> **Not like for like:** the live columns were measured on pipeline \`${liveVersion}\` (${store.live.runAt.slice(0, 10)}), before the changes under "What changed" in [README.md](README.md); the offline columns on \`${offlineVersion}\`. Re-run the live pass on a fresh day's Groq quota to compare.`,
      "",
    );
  }
  for (const mode of ["offline", "live"]) {
    for (const [config, run] of Object.entries(store[mode]?.configs ?? {})) parts.push(renderRun(mode, config, run, store));
  }
  if (!store.live) parts.push("## Live · Groq vision model", "", "Not run yet: `npm run eval:verification -- --live` (needs `GROQ_API_KEY` in `.env.local`).", "");
  return parts.join("\n");
}
