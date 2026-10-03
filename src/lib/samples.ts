import sharp from "sharp";
import { CURRENCY_SCALE, fmtMoney } from "./shared";

/**
 * Generates realistic demo proof documents on the fly (fresh dates, the
 * account holder's name, local currency) so verification can be demonstrated
 * end to end: valid documents, a mismatch, a stale one and a forged one.
 */

export const SAMPLES: Record<string, { label: string; category: string; expect: string }> = {
  "medical-invoice": { label: "Hospital invoice", category: "health", expect: "Should auto-approve from a Health vault" },
  "pharmacy-receipt": { label: "Pharmacy receipt", category: "health", expect: "Should auto-approve from a Health vault" },
  "tuition-invoice": { label: "Tuition invoice (dependant)", category: "education", expect: "Education vault — name is a dependant's" },
  "rent-receipt": { label: "Rent receipt", category: "housing", expect: "Should pass for a Housing vault" },
  "coffee-receipt": { label: "Coffee shop receipt", category: "other", expect: "Purpose mismatch — should be declined" },
  "old-invoice": { label: "Ten-month-old invoice", category: "health", expect: "Outside the document-age window" },
  "tampered-invoice": { label: "Edited hospital invoice", category: "health", expect: "Total was altered — tamper checks should fire" },
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

interface DocSpec {
  issuer: string;
  issuerLine: string;
  title: string;
  number: string;
  date: string;
  billedLabel: string;
  billedTo: string;
  items: [string, number][];
  tax?: number;
  footer: string;
  accent: string;
}

function money(minor: number, currency: string) {
  return fmtMoney(minor, currency).replace(/ /g, " ");
}

function docSvg(spec: DocSpec, currency: string, opts: { totalOverride?: number } = {}) {
  const W = 820;
  const H = 1080;
  const subtotal = spec.items.reduce((s, [, a]) => s + a, 0);
  const tax = spec.tax ?? 0;
  const total = subtotal + tax;
  const rows = spec.items
    .map(
      ([d, a], k) =>
        `<text x="70" y="${470 + k * 44}" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#222">${esc(d)}</text>
         <text x="750" y="${470 + k * 44}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#222">${esc(money(a, currency))}</text>`,
    )
    .join("");
  const yEnd = 470 + spec.items.length * 44;
  return {
    total: opts.totalOverride ?? total,
    totalY: yEnd + 118,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="#fbfaf5"/>
  <rect x="0" y="0" width="${W}" height="14" fill="${spec.accent}"/>
  <circle cx="98" cy="96" r="34" fill="${spec.accent}" opacity="0.9"/>
  <text x="98" y="108" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="bold" fill="#fff">${esc(spec.issuer[0])}</text>
  <text x="150" y="92" font-family="Helvetica, Arial, sans-serif" font-size="32" font-weight="bold" fill="#111">${esc(spec.issuer)}</text>
  <text x="150" y="124" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#555">${esc(spec.issuerLine)}</text>
  <text x="70" y="210" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="bold" fill="#111">${esc(spec.title)}</text>
  <text x="70" y="256" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#333">No. ${esc(spec.number)}</text>
  <text x="70" y="290" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#333">Date: ${esc(spec.date)}</text>
  <text x="470" y="256" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#666">${esc(spec.billedLabel)}</text>
  <text x="470" y="288" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="bold" fill="#111">${esc(spec.billedTo)}</text>
  <line x1="70" y1="380" x2="750" y2="380" stroke="#999" stroke-width="1.5"/>
  <text x="70" y="410" font-family="Helvetica, Arial, sans-serif" font-size="17" fill="#666">DESCRIPTION</text>
  <text x="750" y="410" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="17" fill="#666">AMOUNT</text>
  ${rows}
  <line x1="70" y1="${yEnd + 10}" x2="750" y2="${yEnd + 10}" stroke="#bbb" stroke-width="1"/>
  <text x="560" y="${yEnd + 50}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#444">Subtotal</text>
  <text x="750" y="${yEnd + 50}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#444">${esc(money(subtotal, currency))}</text>
  <text x="560" y="${yEnd + 80}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#444">Tax</text>
  <text x="750" y="${yEnd + 80}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#444">${esc(money(tax, currency))}</text>
  <text x="560" y="${yEnd + 118}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="bold" fill="#111">TOTAL (${currency})</text>
  <text x="750" y="${yEnd + 118}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="bold" fill="#111">${esc(money(total, currency))}</text>
  <text x="70" y="${H - 90}" font-family="Helvetica, Arial, sans-serif" font-size="17" fill="#666">${esc(spec.footer)}</text>
  <text x="70" y="${H - 60}" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#999">Thank you. Please retain this document for your records.</text>
</svg>`,
  };
}

/** Places the document on a desk-like background with a slight tilt, then compresses like a phone camera. */
async function photograph(svg: string, quality = 72, tilt = true) {
  const doc = await sharp(Buffer.from(svg)).png().toBuffer();
  const tilted = tilt ? await sharp(doc).rotate(1.2, { background: "#7d7468" }).toBuffer() : doc;
  const meta = await sharp(tilted).metadata();
  const framed = await sharp({ create: { width: (meta.width ?? 820) + 60, height: (meta.height ?? 1080) + 60, channels: 3, background: "#6f675c" } })
    .composite([{ input: tilted, top: 30, left: 30 }])
    .jpeg({ quality })
    .toBuffer();
  return framed;
}

export async function renderSample(key: string, user: { name: string; currency: string }, opts: { date?: string } = {}) {
  const m = CURRENCY_SCALE[user.currency] ?? 1;
  const d = (daysAgo: number) => opts.date ?? isoDaysAgo(daysAgo);
  // Deterministic per document/date: re-downloading a sample yields identical bytes,
  // so submitting it twice demonstrates duplicate detection.
  const ref = (base: number, daysAgo: number, doc = key) =>
    base + ([...`${doc}|${d(daysAgo)}|${user.name}`].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % 97);
  const amt = (major: number) => Math.round(major * m * 100);
  const last = user.name.split(/\s+/).at(-1) ?? "Morgan";
  const medical: DocSpec = {
    issuer: "City General Hospital",
    issuerLine: "Outpatient Billing · 400 Lakeshore Ave",
    title: "Patient Invoice",
    number: `INV-${ref(20931, 4, "medical-invoice")}`, // the forged copy keeps the original's number
    date: d(4),
    billedLabel: "PATIENT",
    billedTo: user.name,
    items: [
      ["Cardiology consultation", amt(150)],
      ["Electrocardiogram (ECG)", amt(85)],
      ["Comprehensive blood panel", amt(62.5)],
    ],
    footer: "Payment due within 30 days. Insurance claims ref: OP-55120.",
    accent: "#1f6feb",
  };
  let spec: DocSpec;
  switch (key) {
    case "medical-invoice":
      spec = medical;
      break;
    case "old-invoice":
      spec = { ...medical, number: "INV-17402", date: isoDaysAgo(300) };
      break;
    case "pharmacy-receipt":
      spec = {
        issuer: "Greenleaf Pharmacy",
        issuerLine: "Licensed Pharmacy #4471 · 12 Market Street",
        title: "Pharmacy Receipt",
        number: `RX-${ref(88213, 2)}`,
        date: d(2),
        billedLabel: "PATIENT",
        billedTo: user.name,
        items: [
          ["Amoxicillin 500 mg (prescription)", amt(18.2)],
          ["Ibuprofen 400 mg x 30", amt(7.99)],
          ["Digital blood pressure monitor", amt(52)],
        ],
        tax: amt(8.21),
        footer: "Prescription filled by R. Okafor, PharmD.",
        accent: "#10a37f",
      };
      break;
    case "tuition-invoice":
      spec = {
        issuer: "Riverside University",
        issuerLine: "Office of the Bursar · Student Accounts",
        title: "Tuition Fee Invoice — Fall Semester",
        number: `BUR-${ref(560112, 6)}`,
        date: d(6),
        billedLabel: "STUDENT",
        billedTo: `Maya ${last}`,
        items: [
          ["Undergraduate tuition (12 credits)", amt(2300)],
          ["Laboratory fee", amt(150)],
        ],
        footer: "Enrolment is confirmed on receipt of payment.",
        accent: "#b4462b",
      };
      break;
    case "rent-receipt":
      spec = {
        issuer: "Harbor View Apartments",
        issuerLine: "Property Management Office · Unit 4B",
        title: "Rent Receipt",
        number: `RR-${ref(3301, 3)}`,
        date: d(3),
        billedLabel: "TENANT",
        billedTo: user.name,
        items: [
          ["Monthly rent — Unit 4B", amt(1100)],
          ["Maintenance charge", amt(100)],
        ],
        footer: "Received with thanks by the landlord's agent. Lease ref HV-2025-118.",
        accent: "#0f8a6a",
      };
      break;
    case "coffee-receipt":
      spec = {
        issuer: "Brew & Co. Coffee",
        issuerLine: "Downtown Roastery",
        title: "Sales Receipt",
        number: `S-${ref(4410, 1)}`,
        date: d(1),
        billedLabel: "SERVED BY",
        billedTo: "Jordan",
        items: [
          ["Oat latte (large)", amt(5.25)],
          ["Almond croissant", amt(4.1)],
        ],
        footer: "Free wifi: BrewGuest.",
        accent: "#6b4423",
      };
      break;
    case "tampered-invoice": {
      // Photograph the genuine invoice, then paste a crisp new total over it and re-export.
      const real = docSvg(medical, user.currency);
      const base = await photograph(real.svg, 70, false);
      const fake = money(amt(1297.5), user.currency);
      const patch = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="250" height="44"><rect width="100%" height="100%" fill="#fbfaf5"/>
         <text x="246" y="33" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="27" font-weight="bold" fill="#0a0a0a">${esc(fake)}</text></svg>`,
      );
      return sharp(base)
        .composite([{ input: await sharp(patch).png().toBuffer(), top: 30 + real.totalY - 33, left: 30 + 750 - 246 }])
        .jpeg({ quality: 95 })
        .toBuffer();
    }
    default:
      throw new Error("Unknown sample");
  }
  return photograph(docSvg(spec, user.currency).svg);
}
