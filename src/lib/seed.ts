import fs from "node:fs";
import path from "node:path";
import { get, newId, run, tx, UPLOAD_DIR } from "./db";
import { audit } from "./audit";
import { countryInfo, defaultCountryFor, rulesFor } from "./compliance";
import { transfer, userAccount, worldAccount } from "./ledger";
import { createUser, type User } from "./users";
import { createVault, creditIncome, deposit, recordSpend, runDueContributions, sweepRoundups } from "./vaults";
import { executeEmergency } from "./emergency";
import { executeSip, fxRate } from "./invest/core";
import { getSeries, rng } from "./invest/market";
import { modelPortfolio, scoreAnswers } from "./invest/profile";
import { PAPER_TIMEFRAME, runPaperEngine, universeFor } from "./invest/satellite";
import { renderSample } from "./samples";
import { dHash, errorLevelAnalysis, sha256 } from "./verification/forensics";
import { PIPELINE_VERSION, type Stage } from "./verification/pipeline";
import { CURRENCY_SCALE, type VaultCategory } from "./shared";

const DAY = 86_400_000;

const MERCHANTS: [string, string, number, number, number][] = [
  // merchant, category, min, max, daily probability
  ["FreshMart Groceries", "groceries", 28, 115, 0.35],
  ["Corner Coffee", "coffee", 3.2, 6.9, 0.45],
  ["Metro Transit", "transport", 2.5, 12, 0.4],
  ["Rideshare", "transport", 9, 34, 0.12],
  ["Noodle House", "dining", 14, 48, 0.18],
  ["Bookshop & Co", "shopping", 9, 42, 0.05],
  ["StreamFlix", "subscriptions", 15.49, 15.49, 0.033],
  ["City Power & Water", "utilities", 82, 138, 0.033],
  ["Greenleaf Pharmacy", "health", 7, 36, 0.05],
];

function stagesFor(
  outcome: "approved" | "denied" | "review",
  info: {
    docType: string;
    issuer: string;
    date: string;
    total: number;
    currency: string;
    category: VaultCategory;
    recipient: string;
    nameMatch: boolean;
    ela: number;
    confidence: number;
    t: number;
    reason?: string;
    requested?: number;
  },
): Stage[] {
  const t = info.t;
  const st = (
    key: string,
    name: string,
    k: number,
    status: Stage["status"],
    checks: Stage["checks"],
    score: number,
    data?: Record<string, unknown>,
  ): Stage => ({
    key,
    name,
    status,
    score,
    startedAt: t + k * 400,
    finishedAt: t + k * 400 + 350,
    checks,
    data,
  });
  const totalFmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: info.currency,
  }).format(info.total / 100);
  const mismatch = outcome === "denied";
  return [
    st(
      "intake",
      "Upload & integrity",
      0,
      "passed",
      [
        { label: "File type", status: "pass", detail: "image/jpeg" },
        {
          label: "Exact duplicate",
          status: "pass",
          detail: "SHA-256 not seen before",
        },
      ],
      1,
    ),
    st(
      "preprocess",
      "Pre-processing & forensics",
      1,
      "passed",
      [
        {
          label: "Normalised",
          status: "pass",
          detail: "Auto-oriented, trimmed, contrast-normalised, denoised",
        },
        {
          label: "Metadata",
          status: "info",
          detail: "No EXIF metadata (common for scans and screenshots)",
        },
      ],
      1,
    ),
    st(
      "extract",
      "OCR & layout understanding",
      2,
      "passed",
      [
        {
          label: "Document detected",
          status: "pass",
          detail: `${info.docType.replace(/_/g, " ")} from ${info.issuer}`,
        },
        {
          label: "Fields extracted",
          status: "pass",
          detail: "4/4 key fields · legibility 96%",
        },
      ],
      0.95,
      {
        documentType: info.docType,
        issuer: info.issuer,
        recipient: info.recipient,
        date: info.date,
        total: info.total / 100,
        currency: info.currency,
      },
    ),
    st(
      "classify",
      "Purpose classification",
      3,
      mismatch || (info.requested ?? 0) > info.total ? "failed" : info.nameMatch ? "passed" : "warning",
      [
        mismatch
          ? {
              label: "Matches purpose",
              status: "fail",
              detail: info.reason ?? "Document doesn't match the vault's purpose",
            }
          : {
              label: "Matches purpose",
              status: "pass",
              detail: "Model 97% · keywords 91%",
            },
        info.requested && info.requested > info.total
          ? {
              label: "Amount covered",
              status: "fail",
              detail: `Document total ${totalFmt} is less than requested ${new Intl.NumberFormat("en-US", { style: "currency", currency: info.currency }).format(info.requested / 100)}`,
            }
          : {
              label: "Amount covered",
              status: "pass",
              detail: `Document total ${totalFmt} ≥ requested`,
            },
        {
          label: "Document date",
          status: "pass",
          detail: `${info.date} · within window`,
        },
        info.nameMatch
          ? {
              label: "Name on document",
              status: "pass",
              detail: `"${info.recipient}" matches the account holder`,
            }
          : {
              label: "Name on document",
              status: "warn",
              detail: `"${info.recipient}" — may be a dependant; reviewer to confirm`,
            },
      ],
      mismatch ? 0.08 : 0.92,
    ),
    st(
      "tamper",
      "Tamper & reuse detection",
      4,
      "passed",
      [
        {
          label: "Error level analysis",
          status: "pass",
          detail: `Anomaly ${(info.ela * 100).toFixed(0)}% · no localised inconsistency`,
        },
        {
          label: "Perceptual reuse",
          status: "pass",
          detail: "No visually similar prior documents",
        },
        {
          label: "Visual edit signs",
          status: "pass",
          detail: "None noticed by the vision model",
        },
      ],
      1 - info.ela,
    ),
    st(
      "decision",
      "Decision & audit trail",
      5,
      outcome === "approved" ? "passed" : outcome === "denied" ? "failed" : "warning",
      [
        {
          label: "Confidence",
          status: outcome === "approved" ? "pass" : outcome === "denied" ? "fail" : "warn",
          detail: `${(info.confidence * 100).toFixed(0)}% · approve ≥ 85%, deny ≤ 35%`,
        },
        {
          label: "Route",
          status: "info",
          detail:
            outcome === "approved"
              ? "Approved automatically — funds released"
              : outcome === "denied"
                ? "Declined automatically — the user can appeal to a person"
                : "Queued for a human reviewer (SLA 4 business hours)",
        },
      ],
      info.confidence,
    ),
  ];
}

async function seedProof(
  user: User,
  o: {
    sample: string;
    date: string;
    ts: number;
    purpose: "withdrawal" | "emergency_receipt";
    category: VaultCategory;
    vaultId?: string;
    withdrawalId?: string;
    emergencyId?: string;
    outcome: "approved" | "denied" | "review";
    confidence: number;
    docType: string;
    issuer: string;
    recipient: string;
    nameMatch: boolean;
    total: number;
    reason?: string;
    requested?: number;
  },
) {
  const buf = await renderSample(o.sample, user, { date: o.date });
  const id = newId("prf");
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const stored = path.join(UPLOAD_DIR, `${id}.jpg`);
  fs.writeFileSync(stored, buf);
  // Rendered samples are ~1 MP, well under the ELA size limit.
  const ela = (await errorLevelAnalysis(buf))!;
  const elaPath = stored.replace(/\.jpg$/, "_ela.png");
  fs.writeFileSync(elaPath, ela.heatmap);
  const phash = await dHash(buf);
  const stages = stagesFor(o.outcome, {
    docType: o.docType,
    issuer: o.issuer,
    date: o.date,
    total: o.total,
    currency: user.currency,
    category: o.category,
    recipient: o.recipient,
    nameMatch: o.nameMatch,
    ela: ela.score,
    confidence: o.confidence,
    t: o.ts,
    reason: o.reason,
    requested: o.requested,
  });
  const extracted = {
    is_document: true,
    document_type: o.docType,
    issuer: o.issuer,
    recipient_name: o.recipient,
    document_date: o.date,
    total_amount: o.total / 100,
    currency: user.currency,
    reference_number: null,
    line_items: [],
    category_scores: {},
    purpose_match: o.outcome === "denied" ? 0.05 : 0.95,
    editing_signs: [],
    legibility: 0.96,
    text: "",
    summary: `${o.docType.replace(/_/g, " ")} from ${o.issuer}`,
  };
  run(
    `INSERT INTO proofs (id, user_id, vault_id, withdrawal_id, emergency_id, purpose, category, file_name, mime, size, sha256, phash, stored_path, ela_path, exif, extracted, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'image/jpeg', ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    user.id,
    o.vaultId ?? null,
    o.withdrawalId ?? null,
    o.emergencyId ?? null,
    o.purpose,
    o.category,
    `${o.sample}.jpg`,
    buf.length,
    sha256(buf),
    phash,
    stored,
    elaPath,
    JSON.stringify({ present: false }),
    JSON.stringify(extracted),
    o.ts,
  );
  const decision = o.outcome === "approved" ? "auto_approved" : o.outcome === "denied" ? "auto_denied" : "human_review";
  run(
    `INSERT INTO verifications (id, proof_id, status, stages, confidence, decision, final_decision, reasons, model_version, queued_at, decided_at, duration_ms, created_at)
     VALUES (?, ?, 'complete', ?, ?, ?, ?, ?, ?, ?, ?, 2400, ?)`,
    newId("ver"),
    id,
    JSON.stringify(stages),
    o.confidence,
    decision,
    o.outcome === "review" ? null : o.outcome,
    JSON.stringify(
      o.outcome === "approved"
        ? [`High confidence (${Math.round(o.confidence * 100)}%) that this ${o.docType.replace(/_/g, " ")} supports the withdrawal`]
        : o.outcome === "denied"
          ? [o.reason ?? "The document doesn't match the vault's purpose"]
          : [o.reason ?? "Confidence is between the auto-deny and auto-approve thresholds"],
    ),
    `${PIPELINE_VERSION} · seeded history`,
    o.outcome === "review" ? o.ts + 3000 : null,
    o.outcome === "review" ? null : o.ts + 3000,
    o.ts,
  );
  audit({
    userId: user.id,
    actor: user.id,
    actorType: "user",
    action: "proof.uploaded",
    entityType: "proof",
    entityId: id,
    details: { purpose: o.purpose, category: o.category },
    ts: o.ts,
  });
  audit({
    userId: user.id,
    actor: PIPELINE_VERSION,
    actorType: "model",
    action: `verification.${decision}`,
    entityType: "proof",
    entityId: id,
    details: { confidence: o.confidence },
    ts: o.ts + 3000,
  });
  return id;
}

/**
 * Builds a four-month demo history in strict chronological order, so the
 * hash-chained audit log stays in time order and every balance is the
 * product of real ledger postings.
 */
export async function seedDemo(opts: { name: string; country?: string; jurisdiction?: string; pin: string; email?: string }) {
  const country = countryInfo(opts.country ?? defaultCountryFor(opts.jurisdiction ?? "US"))?.code ?? "US";
  const rules = rulesFor(countryInfo(country)!.market);
  const cur = rules.currency;
  const m = CURRENCY_SCALE[cur] ?? 1;
  const amt = (major: number) => Math.round(major * m * 100);
  const now = Date.now();
  const T0 = now - 120 * DAY;
  const rand = rng(42);

  // Historical monthly prices (wallet currency) for back-dated SIP buys.
  const allocs = modelPortfolio(rules.code, 3);
  const priceTables = await Promise.all(
    allocs.map(async (a) => {
      const s = await getSeries(a.symbol, "1d", "1y");
      const fx = s.currency === cur ? 1 : await fxRate(s.currency, cur).catch(() => 1);
      return {
        symbol: a.symbol,
        candles: s.candles.map((c) => ({ t: c.t, p: c.c * fx })),
      };
    }),
  );
  const priceAt = (t: number) =>
    Object.fromEntries(
      priceTables.map((pt) => {
        const before = pt.candles.filter((c) => c.t <= t);
        return [pt.symbol, (before.at(-1) ?? pt.candles[0]).p];
      }),
    );

  const user = createUser({
    id: "usr_demo",
    name: opts.name,
    email: opts.email,
    country,
    pin: opts.pin,
    createdAt: T0,
  });
  const fresh = () => get<User>("SELECT * FROM users WHERE id = ?", user.id)!;

  const bank = userAccount(user.id, "bank", cur);
  const world = worldAccount(cur);
  transfer({
    userId: user.id,
    from: world.id,
    to: bank.id,
    amount: amt(6200),
    kind: "income",
    memo: "Opening balance from Everyday Checking",
    ts: T0 + 60_000,
  });

  run(
    `INSERT INTO external_accounts (id, user_id, institution, name, kind, mask, balance, is_primary, created_at) VALUES
     (?, ?, 'Harbor Federal', 'Everyday Checking', 'checking', '4821', 0, 1, ?),
     (?, ?, 'Northwind Bank', 'Rewards Credit Card', 'credit', '1190', ?, 0, ?),
     (?, ?, 'Northwind Bank', 'High-Yield Savings', 'savings', '7730', ?, 0, ?)`,
    newId("ext"),
    user.id,
    T0,
    newId("ext"),
    user.id,
    -amt(842.17),
    T0,
    newId("ext"),
    user.id,
    amt(12400),
    T0,
  );

  const months = (n: number) => new Date(now + n * 30.44 * DAY).toISOString().slice(0, 10);
  const t1 = T0 + DAY;
  const health = createVault(user, {
    name: "Family Health Fund",
    category: "health",
    target: amt(5000),
    targetDate: months(8),
    ruleType: "fixed",
    ruleAmount: amt(250),
    ruleFrequency: "monthly",
    isJoint: true,
    members: [{ name: "Sam Morgan", email: "sam@example.com" }],
    createdAt: t1,
  });
  const college = createVault(user, {
    name: "Maya's College Fund",
    category: "education",
    target: amt(20000),
    targetDate: months(72),
    ruleType: "percent_income",
    rulePercent: 5,
    createdAt: t1 + 60_000,
  });
  const apartment = createVault(user, {
    name: "Apartment Deposit",
    category: "housing",
    target: amt(6000),
    targetDate: months(9),
    ruleType: "fixed",
    ruleAmount: amt(100),
    ruleFrequency: "weekly",
    createdAt: t1 + 120_000,
  });
  const rainy = createVault(user, {
    name: "Rainy Day Fund",
    category: "emergency",
    target: amt(3000),
    ruleType: "roundup",
    createdAt: t1 + 180_000,
  });
  const retire = createVault(user, {
    name: "Retirement Top-up",
    category: "retirement",
    target: amt(50000),
    targetDate: months(300),
    ruleType: "fixed",
    ruleAmount: amt(150),
    ruleFrequency: "monthly",
    createdAt: t1 + 240_000,
  });
  const wedding = createVault(user, {
    name: "Wedding Fund",
    category: "custom",
    target: amt(8000),
    targetDate: months(14),
    createdAt: t1 + 300_000,
  });

  const u0 = fresh();
  deposit(u0, health, amt(800), {
    memo: "Opening contribution",
    ts: t1 + 400_000,
  });
  deposit(u0, college, amt(1500), {
    memo: "Opening contribution",
    ts: t1 + 410_000,
  });
  deposit(u0, apartment, amt(600), {
    memo: "Opening contribution",
    ts: t1 + 420_000,
  });
  deposit(u0, rainy, amt(300), {
    memo: "Opening contribution",
    ts: t1 + 430_000,
  });
  deposit(u0, retire, amt(1000), {
    memo: "Opening contribution",
    ts: t1 + 440_000,
  });
  deposit(u0, wedding, amt(400), {
    memo: "Opening contribution",
    ts: t1 + 450_000,
  });

  const healthAcct = get<{ account_id: string }>("SELECT account_id FROM vaults WHERE id = ?", health)!.account_id;
  const sam = get<{ id: string }>("SELECT id FROM vault_members WHERE vault_id = ? AND role = 'co-saver'", health)!.id;

  let sipStarted = false;
  for (let d = 2; d < 120; d++) {
    const dayStart = T0 + d * DAY;
    const date = new Date(dayStart);
    const u = fresh();
    if (date.getDate() === 1 || date.getDate() === 15) creditIncome(u, amt(2150), "Acme Analytics Inc.", dayStart + 8 * 3_600_000);
    for (const [merchant, category, lo, hi, p] of MERCHANTS) {
      if (rand() < p) {
        const amount = Math.round((lo + rand() * (hi - lo)) * m * 100);
        try {
          recordSpend(u, merchant, category, amount, dayStart + (9 + Math.floor(rand() * 11)) * 3_600_000 + Math.floor(rand() * 3_600_000));
        } catch {
          // insufficient funds that day — skip
        }
      }
    }
    if (date.getDay() === 0) {
      try {
        sweepRoundups(u, dayStart + 21 * 3_600_000);
      } catch {
        // nothing to sweep
      }
    }
    if (d % 21 === 10) {
      // Sam's contributions arrive from their own bank into the joint vault.
      transfer({
        userId: user.id,
        from: world.id,
        to: healthAcct,
        amount: amt(120),
        kind: "deposit",
        memo: "Contribution from Sam Morgan",
        refType: "vault",
        refId: health,
        ts: dayStart + 19 * 3_600_000,
        actor: "Sam Morgan",
        actorType: "user",
      });
      run("UPDATE vault_members SET contributed = contributed + ? WHERE id = ?", amt(120), sam);
    }
    runDueContributions(u, dayStart + 23 * 3_600_000);

    if (d === 24) {
      const profile = scoreAnswers({
        age: 1,
        horizon: 3,
        income: 2,
        cushion: 2,
        drawdown: 2,
        experience: 2,
        goal: 2,
      });
      run("UPDATE users SET risk_profile = ? WHERE id = ?", JSON.stringify({ ...profile, completedAt: dayStart + 10 * 3_600_000 }), user.id);
      audit({
        userId: user.id,
        actor: user.id,
        actorType: "user",
        action: "invest.risk_profiled",
        entityType: "user",
        entityId: user.id,
        details: { score: profile.score, band: profile.band },
        ts: dayStart + 10 * 3_600_000,
      });
      run(
        "INSERT INTO sip_plans (id, user_id, amount, frequency, next_run_at, active, created_at) VALUES (?, ?, ?, 'monthly', ?, 1, ?)",
        newId("sip"),
        user.id,
        amt(300),
        dayStart + 30 * DAY + 11 * 3_600_000,
        dayStart + 10 * 3_600_000,
      );
      sipStarted = true;
    }
    if (sipStarted && (d === 25 || d === 55 || d === 85 || d === 115)) {
      const ts = dayStart + 11 * 3_600_000;
      await executeSip(fresh(), d === 25 ? amt(1500) : amt(300), {
        source: d === 25 ? "manual" : "sip",
        ts,
        priceOverride: priceAt(ts),
      });
      if (d > 25) run("UPDATE sip_plans SET next_run_at = ? WHERE user_id = ?", ts + 30 * DAY, user.id);
    }

    if (d === 58) {
      // A verified withdrawal: pharmacy receipt against the Health vault.
      const ts = dayStart + 15 * 3_600_000;
      const wid = newId("wdr");
      // Same per-item rounding as the rendered receipt.
      const amount = amt(18.2) + amt(7.99) + amt(52) + amt(8.21);
      run(
        "INSERT INTO withdrawals (id, user_id, vault_id, amount, payee, note, status, created_at) VALUES (?, ?, ?, ?, 'Greenleaf Pharmacy', 'Antibiotics and BP monitor', 'verifying', ?)",
        wid,
        user.id,
        health,
        amount,
        ts,
      );
      audit({
        userId: user.id,
        actor: user.id,
        actorType: "user",
        action: "withdrawal.requested",
        entityType: "withdrawal",
        entityId: wid,
        details: { vaultId: health, amount },
        ts,
      });
      const pid = await seedProof(fresh(), {
        sample: "pharmacy-receipt",
        date: new Date(ts - DAY).toISOString().slice(0, 10),
        ts: ts + 20_000,
        purpose: "withdrawal",
        category: "health",
        vaultId: health,
        withdrawalId: wid,
        outcome: "approved",
        confidence: 0.93,
        docType: "pharmacy_receipt",
        issuer: "Greenleaf Pharmacy",
        recipient: opts.name,
        nameMatch: true,
        total: amount,
      });
      run("UPDATE withdrawals SET proof_id = ? WHERE id = ?", pid, wid);
      // Pay out at the time the decision was made.
      tx(() => {
        const acct = get<{ account_id: string }>("SELECT account_id FROM vaults WHERE id = ?", health)!;
        const j = transfer({
          userId: user.id,
          from: acct.account_id,
          to: bank.id,
          amount,
          kind: "withdrawal",
          memo: "Verified withdrawal · Greenleaf Pharmacy",
          refType: "withdrawal",
          refId: wid,
          ts: ts + 24_000,
          actor: PIPELINE_VERSION,
          actorType: "model",
        });
        run("UPDATE withdrawals SET status = 'paid', journal_id = ?, decided_at = ? WHERE id = ?", j, ts + 24_000, wid);
      });
    }

    if (d === 80) {
      const ts = dayStart + 2 * 3_600_000 + 1_800_000;
      const r = executeEmergency(
        fresh(),
        {
          amount: amt(180),
          reasonCode: "medical",
          attest: true,
          note: "Urgent care visit for a fever",
        },
        ts,
      );
      const pid = await seedProof(fresh(), {
        sample: "medical-invoice",
        date: new Date(ts).toISOString().slice(0, 10),
        ts: ts + 26 * 3_600_000,
        purpose: "emergency_receipt",
        category: "health",
        emergencyId: r.id,
        outcome: "approved",
        confidence: 0.91,
        docType: "medical_invoice",
        issuer: "City General Hospital",
        recipient: opts.name,
        nameMatch: true,
        total: amt(150) + amt(85) + amt(62.5),
      });
      run("UPDATE emergency_requests SET receipt_status = 'verified', receipt_proof_id = ? WHERE id = ?", pid, r.id);
    }

    if (d === 105) {
      // Opt in to the Satellite sleeve (paper trading begins here).
      const ts = dayStart + 12 * 3_600_000;
      const sat = userAccount(user.id, "satellite_cash", cur);
      transfer({
        userId: user.id,
        from: bank.id,
        to: sat.id,
        amount: amt(220),
        kind: "satellite_allocate",
        memo: "Allocate to Satellite sleeve",
        ts,
        actor: user.id,
        actorType: "user",
      });
      run("UPDATE users SET satellite_opt_in = 1, satellite_opted_at = ? WHERE id = ?", ts, user.id);
      for (const mk of universeFor(fresh()).filter((x) => x.allowed)) {
        run(
          "INSERT OR IGNORE INTO paper_state (user_id, symbol, timeframe, enabled, last_bar_t) VALUES (?, ?, ?, 1, ?)",
          user.id,
          mk.symbol,
          PAPER_TIMEFRAME,
          ts,
        );
      }
      audit({
        userId: user.id,
        actor: user.id,
        actorType: "user",
        action: "satellite.opted_in",
        entityType: "satellite",
        details: { amount: amt(220), disclosuresAcknowledged: 4 },
        ts,
      });
    }

    if (d === 109) {
      // A declined attempt: coffee receipt against the Health vault.
      const ts = dayStart + 13 * 3_600_000;
      const wid = newId("wdr");
      run(
        "INSERT INTO withdrawals (id, user_id, vault_id, amount, payee, note, status, created_at) VALUES (?, ?, ?, ?, 'Brew & Co. Coffee', NULL, 'verifying', ?)",
        wid,
        user.id,
        health,
        amt(5.25) + amt(4.1),
        ts,
      );
      audit({
        userId: user.id,
        actor: user.id,
        actorType: "user",
        action: "withdrawal.requested",
        entityType: "withdrawal",
        entityId: wid,
        details: { vaultId: health, amount: amt(5.25) + amt(4.1) },
        ts,
      });
      const pid = await seedProof(fresh(), {
        sample: "coffee-receipt",
        date: new Date(ts).toISOString().slice(0, 10),
        ts: ts + 15_000,
        purpose: "withdrawal",
        category: "health",
        vaultId: health,
        withdrawalId: wid,
        outcome: "denied",
        confidence: 0.18,
        docType: "retail_receipt",
        issuer: "Brew & Co. Coffee",
        recipient: "Jordan",
        nameMatch: false,
        total: amt(5.25) + amt(4.1),
        reason: "The document doesn't match the Health / Medical purpose",
      });
      run("UPDATE withdrawals SET status = 'denied', proof_id = ?, decided_at = ? WHERE id = ?", pid, ts + 18_000, wid);
    }
  }

  {
    // Pending human review: rent receipt that covers less than the amount requested.
    // Recent enough that the review SLA is still running when the demo opens.
    const ts = now - 50 * 60_000;
    const wid = newId("wdr");
    const amount = amt(1500);
    const receiptTotal = amt(1100) + amt(100);
    run(
      "INSERT INTO withdrawals (id, user_id, vault_id, amount, payee, note, status, created_at) VALUES (?, ?, ?, ?, 'Harbor View Apartments', 'Security deposit + first month', 'in_review', ?)",
      wid,
      user.id,
      apartment,
      amount,
      ts,
    );
    audit({
      userId: user.id,
      actor: user.id,
      actorType: "user",
      action: "withdrawal.requested",
      entityType: "withdrawal",
      entityId: wid,
      details: { vaultId: apartment, amount },
      ts,
    });
    const fmt = (v: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: cur,
      }).format(v / 100);
    const pid = await seedProof(fresh(), {
      sample: "rent-receipt",
      date: new Date(ts - DAY).toISOString().slice(0, 10),
      ts: ts + 30_000,
      purpose: "withdrawal",
      category: "housing",
      vaultId: apartment,
      withdrawalId: wid,
      outcome: "review",
      confidence: 0.82,
      docType: "rent_receipt",
      issuer: "Harbor View Apartments",
      recipient: opts.name,
      nameMatch: true,
      total: receiptTotal,
      requested: amount,
      reason: `Amount covered: Document total ${fmt(receiptTotal)} is less than requested ${fmt(amount)}`,
    });
    run("UPDATE withdrawals SET proof_id = ? WHERE id = ?", pid, wid);
  }

  // Bring scheduled rules up to date and let the paper engine catch up on real market data.
  const final = fresh();
  runDueContributions(final, now);
  try {
    await runPaperEngine(final);
  } catch {
    // Market data unavailable — the engine catches up on the next run.
  }
  audit({
    userId: user.id,
    actor: "system",
    actorType: "system",
    action: "demo.seeded",
    entityType: "user",
    entityId: user.id,
    details: { days: 120 },
  });
  return final;
}
