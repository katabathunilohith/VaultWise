// Generates the labelled bill dataset for the verification evaluation (see docs/evaluation/README.md).
//
//   node eval/verification/generate.mjs [--out <dir>]
//
// Bills are drawn as SVG and photographed/scanned/edited with sharp. Dates are relative to today (UTC),
// so the set never goes stale; everything else comes from a fixed seed, so a re-run on the same day and
// machine writes byte-identical files (fonts come from the OS, so another machine draws slightly different
// pixels; the labels and fields are the same everywhere).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
export const DEFAULT_DATASET_DIR = path.join(HERE, "out", "dataset");
const MOBILE_SAMPLES = path.join(ROOT, "mobile", "assets", "samples");

export const SEED = 0x5eed2026;
export const MARKET = "IN";
export const CURRENCY = "INR";
/** India's maximum document age (src/lib/compliance.ts, verification.maxDocAgeDays). The runner checks it still matches. */
export const MAX_DOC_AGE_DAYS = 120;
/** What the pipeline should do with each class. Old bills go to a person by design (a failed date check never auto-approves). */
export const EXPECTED = { genuine: "approve", edited: "decline", duplicate: "decline", "wrong-purpose": "decline", stale: "review" };

const DAY = 86_400_000;
const SANS = "Helvetica, Arial, sans-serif";
const SERIF = "Times New Roman, Times, serif";
const MONO = "Courier New, Courier, monospace";

// ---------------------------------------------------------------- seeded randomness

function hashSeed(s) {
  let h = 2166136261 >>> 0;
  for (const ch of s) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** mulberry32, one stream per item id, so adding an item never changes the others. */
function rng(id) {
  let a = (SEED ^ hashSeed(id)) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    range: (lo, hi) => lo + next() * (hi - lo),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    gauss() {
      const u = Math.max(next(), 1e-12);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    },
    shuffle(arr) {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------- formatting

const isoDaysAgo = (today, n) => new Date(Date.parse(today) - n * DAY).toISOString().slice(0, 10);
export const ageInDays = (today, iso) => Math.round((Date.parse(today) - Date.parse(iso)) / DAY);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function showDate(iso, fmt) {
  const [y, m, d] = iso.split("-");
  if (fmt === "dmy") return `${d}/${m}/${y}`;
  if (fmt === "dmon") return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
  return iso;
}
const pad2 = (n) => String(n).padStart(2, "0");
const exifStamp = (iso, h, m) => `${iso.replace(/-/g, ":")} ${pad2(h)}:${pad2(m)}:${pad2((h * 7 + m) % 60)}`;
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PLAIN = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (paise, style = "symbol") => (style === "rs" ? `Rs. ${PLAIN.format(paise / 100)}` : INR.format(paise / 100));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Rough rendered width, to size a patch so it covers the old text. */
function textWidth(text, size, font, weight) {
  if (font === MONO) return text.length * size * 0.6;
  let w = 0;
  for (const ch of text) {
    if (/[0-9]/.test(ch)) w += 0.556;
    else if (/[.,:;'| ]/.test(ch)) w += 0.278;
    else if (/[A-Z₹]/.test(ch)) w += 0.68;
    else w += 0.52;
  }
  return w * size * (weight === "bold" ? 1.08 : 1) * (font === SERIF ? 0.95 : 1);
}

// ---------------------------------------------------------------- bill templates

/** Item rows are [description, minRupees, maxRupees, withPaise?]. Category "other" = not a purpose any vault accepts. */
const TEMPLATES = {
  hospital: {
    layout: "invoice",
    category: "health",
    documentType: "medical_invoice",
    title: "Patient Invoice",
    billedLabel: "PATIENT",
    refPrefix: "INV",
    issuers: [
      ["Sunrise Multispeciality Hospital", "Outpatient Billing · 14 MG Road, Bengaluru"],
      ["Lotus Care Hospital", "Billing Desk · Road No. 12, Banjara Hills, Hyderabad"],
      ["St. Agnes Memorial Hospital", "Patient Accounts · Fort, Mumbai"],
    ],
    items: [
      ["General medicine consultation", 600, 1500],
      ["Cardiology consultation", 1200, 2500],
      ["Electrocardiogram (ECG)", 400, 900],
      ["Complete blood count (CBC)", 300, 700],
      ["Chest X-ray (PA view)", 500, 1200],
      ["Ward charges (1 day, general ward)", 2500, 6000],
      ["Nursing charges", 600, 1500],
      ["Inpatient medicines", 900, 4000],
    ],
    nItems: [2, 4],
    gst: 0,
    extra: "UHID {n}",
    footers: ["Payment due within 30 days. Insurance claims ref: OP-{n}.", "Computer-generated invoice; no signature required."],
  },
  lab: {
    layout: "invoice",
    category: "health",
    documentType: "medical_invoice",
    title: "Diagnostic Lab Invoice",
    billedLabel: "PATIENT",
    refPrefix: "LAB",
    issuers: [
      ["Precision Diagnostics", "NABL-accredited laboratory · Koramangala, Bengaluru"],
      ["Metro Path Labs", "Sample collection centre · Andheri East, Mumbai"],
    ],
    items: [
      ["Lipid profile", 450, 900],
      ["HbA1c (glycated haemoglobin)", 400, 800],
      ["Thyroid profile (T3, T4, TSH)", 500, 1000],
      ["Vitamin D (25-OH)", 900, 1600],
      ["Liver function test", 500, 1100],
      ["Home sample collection", 100, 250],
    ],
    nItems: [2, 4],
    gst: 0,
    extra: "Ref. by Dr. {doctor}",
    footers: ["Reports are available online within 24 hours.", "Thank you for choosing us for your health check."],
  },
  dental: {
    layout: "invoice",
    category: "health",
    documentType: "medical_invoice",
    title: "Dental Treatment Invoice",
    billedLabel: "PATIENT",
    refPrefix: "DN",
    issuers: [
      ["Smile Studio Dental Clinic", "Dr. R. Menon, BDS, MDS · Indiranagar, Bengaluru"],
      ["BrightBite Dental Care", "Clinic & Orthodontics · Salt Lake, Kolkata"],
    ],
    items: [
      ["Dental consultation", 300, 700],
      ["Scaling and polishing", 1200, 2500],
      ["Root canal treatment (molar)", 4500, 9000],
      ["Tooth-coloured filling", 1000, 2200],
      ["Dental X-ray (IOPA)", 200, 450],
    ],
    nItems: [2, 4],
    gst: 0,
    footers: ["Next review in 6 months.", "Payment received by card."],
  },
  pharmacy: {
    layout: "thermal",
    category: "health",
    documentType: "pharmacy_receipt",
    title: "TAX INVOICE",
    billedLabel: "Patient",
    refPrefix: "RX",
    issuers: [
      ["CareWell Chemists", "Shop 7, Jayanagar 4th Block, Bengaluru", "Drug Lic. KA-B21-114588"],
      ["Apna Medical Store", "Near Civil Hospital, Pune", "Drug Lic. MH-PZ4-220317"],
    ],
    items: [
      ["Amoxicillin 500mg x10 (Rx)", 90, 180, true],
      ["Paracetamol 650mg x15", 30, 45, true],
      ["Pantoprazole 40mg x15", 110, 190, true],
      ["Cetirizine 10mg x10", 20, 40, true],
      ["Azithromycin 500mg x3 (Rx)", 110, 160, true],
      ["ORS sachets x5", 90, 120, true],
      ["Digital thermometer", 180, 350, true],
      ["Insulin glargine pen (Rx)", 650, 900, true],
    ],
    nItems: [3, 5],
    gst: 0.12,
    footers: ["Get well soon!", "Medicines once sold will not be taken back."],
  },
  tuition: {
    layout: "invoice",
    category: "education",
    documentType: "tuition_invoice",
    title: "Tuition Fee Invoice — {term}",
    billedLabel: "STUDENT",
    refPrefix: "BUR",
    issuers: [
      ["Riverside University", "Office of the Bursar · Student Accounts"],
      ["Deccan Institute of Technology", "Accounts Section · Hinjawadi, Pune"],
      ["National College of Commerce", "Fee Office · Park Street, Kolkata"],
    ],
    items: [
      ["Tuition fee (semester)", 45000, 120000],
      ["Laboratory fee", 3000, 9000],
      ["Library and exam fee", 1500, 4000],
      ["Student activity fee", 500, 2000],
    ],
    nItems: [2, 3],
    gst: 0,
    extra: "Roll no. {roll}",
    footers: ["Enrolment is confirmed on receipt of payment.", "Fees once paid are adjusted against the semester shown."],
  },
  school: {
    layout: "invoice",
    category: "education",
    documentType: "school_fee_receipt",
    title: "School Fee Receipt — {quarter}",
    billedLabel: "STUDENT",
    refPrefix: "SFR",
    issuers: [
      ["Lakeview Public School", "CBSE Affiliation 830114 · Whitefield, Bengaluru"],
      ["Green Valley High School", "ICSE · Kothrud, Pune"],
    ],
    items: [
      ["Tuition fee (quarter)", 18000, 45000],
      ["Transport fee", 4000, 9000],
      ["Computer lab fee", 1000, 2500],
      ["Annual development fee", 3000, 8000],
    ],
    nItems: [2, 3],
    gst: 0,
    extra: "Class {klass}",
    footers: ["Received with thanks. Keep this receipt for the school year.", "Cheques subject to realisation."],
  },
  bookstore: {
    layout: "thermal",
    category: "education",
    documentType: "retail_receipt",
    title: "CASH MEMO",
    billedLabel: "Student",
    refPrefix: "CBD",
    issuers: [
      ["Campus Book Depot", "Opp. University Gate, Pune", "GSTIN 27AAKFC4471M1Z2"],
      ["Sapna Book House", "Gandhinagar, Bengaluru", "GSTIN 29AAECS1123K1Z8"],
    ],
    items: [
      ["Engineering Mathematics textbook", 650, 900],
      ["Data Structures textbook", 550, 800],
      ["Physics lab manual", 150, 250],
      ["Exam notebooks x6", 180, 300],
      ["Scientific calculator fx-991", 1100, 1400],
    ],
    nItems: [2, 4],
    gst: 0,
    footers: ["Textbooks: no exchange after 7 days.", "Best of luck for your exams!"],
  },
  rent: {
    layout: "invoice",
    category: "housing",
    documentType: "rent_receipt",
    title: "Rent Receipt — {month}",
    billedLabel: "TENANT",
    refPrefix: "RR",
    issuers: [
      ["Harbor View Apartments", "Property Management Office · Powai, Mumbai"],
      ["Prestige Residency Owners", "Flat rental office · HSR Layout, Bengaluru"],
      ["Sai Krupa Properties", "Landlord: K. Srinivas · Ameerpet, Hyderabad"],
    ],
    items: [
      ["Monthly rent — Flat {unit}", 14000, 42000],
      ["Maintenance charge", 1500, 4000],
      ["Covered parking", 500, 1500],
    ],
    nItems: [2, 3],
    keepFirst: true,
    gst: 0,
    extra: "Flat {unit}",
    footers: ["Received with thanks by the landlord's agent. Lease ref {lease}.", "Rent received for the premises above."],
  },
  deposit: {
    layout: "invoice",
    category: "housing",
    documentType: "deposit_invoice",
    title: "Security Deposit Invoice",
    billedLabel: "TENANT",
    refPrefix: "SD",
    issuers: [
      ["Green Acres Co-living", "Leasing Office · Sector 62, Noida"],
      ["UrbanNest Rentals", "Tenancy Desk · Baner, Pune"],
    ],
    items: [
      ["Refundable security deposit (2 months)", 30000, 70000],
      ["Lease agreement and stamp duty", 1000, 3000],
      ["First month rent", 15000, 35000],
    ],
    nItems: [2, 3],
    keepFirst: true,
    gst: 0,
    extra: "Unit {unit}",
    footers: ["The deposit is refundable at the end of the tenancy.", "Lease ref {lease}."],
  },
  plumbing: {
    layout: "invoice",
    category: "emergency",
    documentType: "repair_invoice",
    title: "Emergency Repair Invoice",
    billedLabel: "CUSTOMER",
    refPrefix: "QF",
    issuers: [
      ["QuickFix Plumbing Services", "24x7 emergency call-outs · Velachery, Chennai"],
      ["HomeSure Repairs", "Electrical & plumbing · Gachibowli, Hyderabad"],
    ],
    items: [
      ["Emergency call-out (night)", 500, 900],
      ["Burst pipe repair — labour", 1200, 2500],
      ["CPVC pipe and fittings", 600, 1800],
      ["Water damage clean-up", 1500, 3500],
      ["Electrician — short-circuit repair", 900, 2200],
    ],
    nItems: [2, 4],
    gst: 0.18,
    footers: ["Work guaranteed for 90 days.", "Urgent job attended within 2 hours of the call."],
  },
  towing: {
    layout: "invoice",
    category: "emergency",
    documentType: "repair_invoice",
    title: "Towing & Breakdown Invoice",
    billedLabel: "CUSTOMER",
    refPrefix: "TW",
    issuers: [["Highway Rescue Towing", "Roadside assistance · NH-48, Gurugram"]],
    items: [
      ["Towing (up to 25 km)", 1800, 3500],
      ["Flatbed surcharge", 500, 1200],
      ["Battery jump-start", 400, 800],
      ["Urgent tyre replacement", 2500, 5000],
    ],
    nItems: [2, 3],
    gst: 0.18,
    extra: "Vehicle KA-0{n}",
    footers: ["Breakdown attended on the highway.", "Thank you for calling Highway Rescue."],
  },
  pension: {
    layout: "invoice",
    category: "retirement",
    documentType: "pension_statement",
    title: "Pension Contribution Statement",
    billedLabel: "SUBSCRIBER",
    refPrefix: "PRAN",
    issuers: [["National Pension Trust", "NPS Tier I · Central Recordkeeping Agency"]],
    items: [
      ["Voluntary contribution — Tier I", 10000, 50000],
      ["Annuity purchase top-up", 15000, 60000],
    ],
    nItems: [2, 2],
    gst: 0,
    footers: ["Retirement savings statement for the period shown.", "Annuity and provident fund details overleaf."],
  },
  restaurant: {
    layout: "thermal",
    category: "other",
    documentType: "restaurant_bill",
    title: "BILL",
    billedLabel: null,
    refPrefix: "T",
    issuers: [
      ["Spice Route Restaurant", "Bar & Kitchen · Church Street, Bengaluru", "GSTIN 29AAGFS7781R1Z4"],
      ["Punjab Grill House", "Connaught Place, New Delhi", "GSTIN 07AACCP2231D1ZQ"],
    ],
    items: [
      ["Paneer tikka", 280, 380],
      ["Butter naan x4", 160, 240],
      ["Dal makhani", 260, 340],
      ["Chicken biryani", 320, 450],
      ["Mango lassi x2", 180, 260],
      ["Gulab jamun", 120, 180],
    ],
    nItems: [3, 5],
    gst: 0.05,
    footers: ["Thank you! Visit again.", "Service charge not included."],
  },
  electronics: {
    layout: "invoice",
    category: "other",
    documentType: "retail_invoice",
    title: "Tax Invoice",
    billedLabel: "BILL TO",
    refPrefix: "GH",
    issuers: [
      ["Gadget Hub Electronics", "Phoenix Marketcity · Whitefield, Bengaluru"],
      ["Digital Planet Store", "Linking Road, Bandra West, Mumbai"],
    ],
    items: [
      ['55" 4K Smart LED TV', 38000, 52000],
      ["Soundbar 2.1 channel", 7000, 12000],
      ["Wall-mount kit and installation", 900, 1600],
      ["Extended warranty (2 years)", 2500, 4500],
    ],
    nItems: [2, 3],
    keepFirst: true,
    gst: 0.18,
    footers: ["Goods once sold will not be taken back.", "Warranty as per manufacturer terms."],
  },
  clothing: {
    layout: "thermal",
    category: "other",
    documentType: "retail_receipt",
    title: "TAX INVOICE",
    billedLabel: "Customer",
    refPrefix: "TT",
    issuers: [["Trendy Threads Fashion", "Forum Mall, Koramangala, Bengaluru", "GSTIN 29AAJFT5521L1Z1"]],
    items: [
      ["Men's denim jeans", 1800, 2800],
      ["Cotton kurta", 900, 1600],
      ["Running shoes", 2800, 4500],
      ["Leather belt", 600, 1100],
    ],
    nItems: [2, 4],
    gst: 0.12,
    footers: ["Exchange within 15 days with this bill.", "Follow us for the festive sale!"],
  },
  hotel: {
    layout: "invoice",
    category: "other",
    documentType: "hotel_invoice",
    title: "Hotel Stay Invoice",
    billedLabel: "GUEST",
    refPrefix: "GR",
    issuers: [["Seabreeze Beach Resort", "Calangute, North Goa"]],
    items: [
      ["Deluxe sea-view room (3 nights)", 18000, 30000],
      ["Spa package for two", 4000, 8000],
      ["Candle-light dinner", 3000, 6000],
    ],
    nItems: [2, 3],
    keepFirst: true,
    gst: 0.12,
    footers: ["We hope you enjoyed your holiday.", "Check-out time 11:00."],
  },
  jewellery: {
    layout: "invoice",
    category: "other",
    documentType: "retail_invoice",
    title: "Retail Invoice",
    billedLabel: "CUSTOMER",
    refPrefix: "JW",
    issuers: [["Shree Lakshmi Jewellers", "BIS hallmarked gold · T. Nagar, Chennai"]],
    items: [
      ["22K gold chain (12.4 g)", 70000, 90000],
      ["Making charges", 6000, 11000],
    ],
    nItems: [2, 2],
    gst: 0.03,
    footers: ["Hallmark certificate enclosed.", "Old gold exchanged at the day's rate."],
  },
};

const PEOPLE = [
  "Priya Sharma", "Arjun Mehta", "Ananya Iyer", "Rahul Verma", "Kavya Nair", "Rohan Gupta", "Meera Pillai", "Vikram Rao",
  "Sneha Kulkarni", "Aditya Joshi", "Fatima Khan", "Noor Ali", "Ishaan Bose", "Divya Reddy", "Karan Malhotra", "Aisha Siddiqui",
  "Siddharth Menon", "Pooja Desai", "Manish Tiwari", "Lakshmi Narayan",
];
const DEPENDANTS = ["Aarav", "Diya", "Kabir", "Anika", "Vihaan", "Saanvi", "Reyansh", "Myra"];
const STRANGERS = ["Rakesh Kumar", "Sunita Devi", "Harish Chandra", "Geeta Bhatt", "Mohan Lal", "Rekha Singh"];
const DOCTORS = ["S. Rao", "A. Kapoor", "M. Fernandes", "P. Krishnan"];
const PHONES = [
  ["samsung", "SM-A546E"],
  ["Xiaomi", "Redmi Note 13 Pro"],
  ["Apple", "iPhone 14"],
  ["OnePlus", "CPH2581"],
];
const DESKS = ["#6f675c", "#5b544c", "#8a7f70", "#4a4f57", "#7a6a58"];
const ACCENTS = ["#1f6feb", "#10a37f", "#b4462b", "#0f8a6a", "#6b4423", "#7b3fa0", "#c2410c", "#0e7490"];
const PAPER = "#fbfaf5";

// ---------------------------------------------------------------- building a bill

function fill(template, r) {
  return template
    .replace("{n}", String(r.int(10000, 99999)))
    .replace("{unit}", `${r.pick(["A", "B", "C"])}-${r.int(101, 1204)}`)
    .replace("{lease}", `LS-${r.int(2025, 2026)}-${r.int(100, 999)}`)
    .replace("{roll}", `${r.int(21, 25)}CS${r.int(1, 120)}`)
    .replace("{klass}", `${r.int(3, 10)}-${r.pick(["A", "B", "C"])}`)
    .replace("{doctor}", r.pick(DOCTORS));
}

/** Picks issuer, line items and amounts for a bill (amounts in paise). */
function buildBill(templateKey, r, { date, recipient, scale = 1 }) {
  const t = TEMPLATES[templateKey];
  const [issuer, issuerLine, licence] = r.pick(t.issuers);
  const count = Math.min(t.items.length, r.int(t.nItems[0], t.nItems[1]));
  const pool = t.keepFirst ? [t.items[0], ...r.shuffle(t.items.slice(1)).slice(0, count - 1)] : r.shuffle(t.items).slice(0, count);
  const unit = `${r.pick(["A", "B", "C"])}-${r.int(101, 1204)}`;
  const items = pool.map(([desc, lo, hi, paise]) => {
    const rupees = r.range(lo, hi);
    const amount = paise ? Math.round(rupees * 100) : Math.round(rupees / 10) * 1000;
    return { description: desc.replace("{unit}", unit), amount: Math.round(amount * scale) };
  });
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const tax = Math.round(subtotal * t.gst);
  const month = MONTHS_LONG[Number(date.slice(5, 7)) - 1];
  const title = t.title
    .replace("{term}", Number(date.slice(5, 7)) >= 7 ? "Odd Semester" : "Even Semester")
    .replace("{quarter}", `Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1} ${date.slice(0, 4)}`)
    .replace("{month}", `${month} ${date.slice(0, 4)}`);
  return {
    template: templateKey,
    layout: t.layout,
    category: t.category,
    documentType: t.documentType,
    issuer,
    issuerLine,
    licence: licence ?? null,
    title,
    billedLabel: t.billedLabel,
    recipient,
    extra: t.extra ? fill(t.extra.replace("{unit}", unit), r) : null,
    reference: `${t.refPrefix}-${r.int(10000, 989999)}`,
    date,
    dateFormat: r.pick(["iso", "dmy", "dmon"]),
    moneyStyle: t.layout === "thermal" ? r.pick(["rs", "symbol"]) : "symbol",
    items,
    subtotal,
    tax,
    taxLabel: t.gst ? `GST ${Math.round(t.gst * 100)}%` : "Tax",
    total: subtotal + tax,
    footer: fill(r.pick(t.footers), r),
    accent: r.pick(ACCENTS),
    logo: r.pick(["circle", "square"]),
    font: t.layout === "thermal" ? MONO : r.pick([SANS, SANS, "Verdana, Geneva, sans-serif", "Segoe UI, Tahoma, sans-serif"]),
  };
}

/** What a perfect reader sees on the finished image: the stub AI returns exactly this (offline mode). */
function visibleFields(bill) {
  return {
    issuer: bill.issuer,
    documentType: bill.documentType,
    category: bill.category,
    recipient: bill.billedLabel ? bill.recipient : null,
    date: bill.date,
    total: bill.total / 100,
    subtotal: bill.subtotal / 100,
    tax: bill.tax / 100,
    currency: CURRENCY,
    reference: bill.reference,
    lineItems: bill.items.map((i) => ({ description: i.description, amount: i.amount / 100 })),
    text: [bill.issuer, bill.issuerLine, bill.title, bill.billedLabel && bill.recipient ? `${bill.billedLabel} ${bill.recipient}` : "", ...bill.items.map((i) => i.description), bill.footer]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 600),
  };
}

// ---------------------------------------------------------------- drawing

const T = (x, y, text, { size = 20, weight = "normal", fill = "#222", anchor = "start", font }) =>
  `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(text)}</text>`;

/** A4-ish invoice. Returns the SVG and the boxes of the fields an editor might change. */
function invoiceSvg(bill) {
  const W = 820;
  const H = 1100;
  const f = bill.font;
  const m = (p) => money(p, bill.moneyStyle);
  const rows = bill.items.map((it, k) => ({ y: 470 + k * 44, ...it }));
  const yEnd = 470 + bill.items.length * 44;
  const box = (x, y, text, o) => ({ x, y, text, anchor: o.anchor ?? "start", size: o.size, weight: o.weight ?? "normal", font: f, fill: o.fill ?? "#222", minX: o.minX });
  const fields = {
    date: box(70, 292, `Date: ${showDate(bill.date, bill.dateFormat)}`, { size: 20, fill: "#333" }),
    name: bill.billedLabel ? box(470, 290, bill.recipient, { size: 22, weight: "bold", fill: "#111" }) : null,
    items: rows.map((row) => box(750, row.y, m(row.amount), { size: 21, anchor: "end", minX: 540 })),
    subtotal: box(750, yEnd + 50, m(bill.subtotal), { size: 20, anchor: "end", fill: "#444", minX: 575 }),
    total: box(750, yEnd + 118, m(bill.total), { size: 25, anchor: "end", weight: "bold", fill: "#111", minX: 575 }),
  };
  const logo =
    bill.logo === "circle"
      ? `<circle cx="98" cy="96" r="34" fill="${bill.accent}"/>`
      : `<rect x="64" y="62" width="68" height="68" rx="10" fill="${bill.accent}"/>`;
  const stamp = bill.stamp
    ? `<g transform="rotate(-14 610 ${yEnd + 200})" opacity="0.72"><rect x="530" y="${yEnd + 168}" width="160" height="58" rx="8" fill="none" stroke="#c0392b" stroke-width="4"/>${T(610, yEnd + 210, "PAID", { size: 36, weight: "bold", fill: "#c0392b", anchor: "middle", font: SANS })}</g>`
    : "";
  const sign = bill.signature
    ? `<path d="M 560 ${H - 168} c 18 -30 30 10 44 -6 s 22 -26 30 4 s 26 -12 40 -2" stroke="#1d3b8a" stroke-width="2.5" fill="none"/>${T(560, H - 140, "Authorised signatory", { size: 15, fill: "#666", font: f })}`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="${PAPER}"/>
  <rect x="0" y="0" width="${W}" height="14" fill="${bill.accent}"/>
  ${logo}
  ${T(98, 108, bill.issuer[0], { size: 34, weight: "bold", fill: "#fff", anchor: "middle", font: SANS })}
  ${T(150, 92, bill.issuer, { size: bill.issuer.length > 26 ? 27 : 31, weight: "bold", fill: "#111", font: f })}
  ${T(150, 122, bill.issuerLine, { size: 17, fill: "#555", font: f })}
  ${T(70, 214, bill.title, { size: 28, weight: "bold", fill: "#111", font: f })}
  ${T(70, 258, `No. ${bill.reference}`, { size: 20, fill: "#333", font: f })}
  ${T(fields.date.x, fields.date.y, fields.date.text, { size: 20, fill: "#333", font: f })}
  ${bill.billedLabel ? T(470, 258, bill.billedLabel, { size: 17, fill: "#666", font: f }) : ""}
  ${fields.name ? T(470, 290, bill.recipient, { size: 22, weight: "bold", fill: "#111", font: f }) : ""}
  ${bill.extra ? T(470, 320, bill.extra, { size: 17, fill: "#555", font: f }) : ""}
  <line x1="70" y1="380" x2="750" y2="380" stroke="#999" stroke-width="1.5"/>
  ${T(70, 410, "DESCRIPTION", { size: 16, fill: "#666", font: f })}
  ${T(750, 410, "AMOUNT", { size: 16, fill: "#666", anchor: "end", font: f })}
  ${rows.map((row) => T(70, row.y, row.description, { size: 21, font: f }) + T(750, row.y, m(row.amount), { size: 21, anchor: "end", font: f })).join("\n  ")}
  <line x1="70" y1="${yEnd + 10}" x2="750" y2="${yEnd + 10}" stroke="#bbb" stroke-width="1"/>
  ${T(560, yEnd + 50, "Subtotal", { size: 20, fill: "#444", anchor: "end", font: f })}
  ${T(750, yEnd + 50, m(bill.subtotal), { size: 20, fill: "#444", anchor: "end", font: f })}
  ${T(560, yEnd + 80, bill.taxLabel, { size: 20, fill: "#444", anchor: "end", font: f })}
  ${T(750, yEnd + 80, m(bill.tax), { size: 20, fill: "#444", anchor: "end", font: f })}
  ${T(560, yEnd + 118, `TOTAL (${CURRENCY})`, { size: 25, weight: "bold", fill: "#111", anchor: "end", font: f })}
  ${T(750, yEnd + 118, m(bill.total), { size: 25, weight: "bold", fill: "#111", anchor: "end", font: f })}
  ${stamp}
  ${sign}
  ${T(70, H - 90, bill.footer, { size: 16, fill: "#666", font: f })}
  ${T(70, H - 60, "Thank you. Please retain this document for your records.", { size: 14, fill: "#999", font: f })}
</svg>`;
  return { svg, W, H, fields };
}

/** Narrow till receipt in a monospace font. */
function thermalSvg(bill) {
  const W = 520;
  const f = MONO;
  const m = (p) => money(p, bill.moneyStyle);
  const rows = bill.items.map((it, k) => ({ y: 352 + k * 34, ...it }));
  const yEnd = 352 + bill.items.length * 34;
  const H = yEnd + 224;
  const dash = (y) => `<line x1="24" y1="${y}" x2="${W - 24}" y2="${y}" stroke="#555" stroke-width="1.2" stroke-dasharray="6 5"/>`;
  const box = (x, y, text, o) => ({ x, y, text, anchor: o.anchor ?? "start", size: o.size, weight: o.weight ?? "normal", font: f, fill: "#1a1a1a", minX: o.minX });
  const who = bill.billedLabel ? `${bill.billedLabel}: ${bill.recipient}` : `Table: ${bill.table ?? 7}   Covers: 2`;
  const fields = {
    date: box(30, 248, `Date: ${showDate(bill.date, bill.dateFormat)}  ${bill.time ?? "18:42"}`, { size: 16 }),
    name: bill.billedLabel ? box(30, 274, who, { size: 16 }) : null,
    items: rows.map((row) => box(W - 30, row.y, m(row.amount), { size: 16, anchor: "end", minX: 330 })),
    subtotal: box(W - 30, yEnd + 30, m(bill.subtotal), { size: 16, anchor: "end", minX: 300 }),
    total: box(W - 30, yEnd + 88, m(bill.total), { size: 20, anchor: "end", weight: "bold", minX: 250 }),
  };
  const t = (x, y, text, o = {}) => T(x, y, text, { size: 16, fill: "#1a1a1a", font: f, ...o });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="#fdfdfb"/>
  ${t(W / 2, 64, bill.issuer, { size: bill.issuer.length > 20 ? 22 : 26, weight: "bold", anchor: "middle" })}
  ${t(W / 2, 94, bill.issuerLine, { size: 14, anchor: "middle" })}
  ${bill.licence ? t(W / 2, 116, bill.licence, { size: 14, anchor: "middle" }) : ""}
  ${t(W / 2, 138, `Ph: 080-${4000_0000 + (bill.reference.length * 7919) % 999_9999}`, { size: 14, anchor: "middle" })}
  ${dash(158)}
  ${t(W / 2, 188, bill.title, { size: 18, weight: "bold", anchor: "middle" })}
  ${t(30, 222, `Bill No: ${bill.reference}`)}
  ${t(fields.date.x, fields.date.y, fields.date.text)}
  ${t(30, 274, who)}
  ${dash(294)}
  ${t(30, 320, "Item")}${t(W - 30, 320, "Amount", { anchor: "end" })}
  ${rows.map((row) => t(30, row.y, row.description.slice(0, 30)) + t(W - 30, row.y, m(row.amount), { anchor: "end" })).join("\n  ")}
  ${dash(yEnd - 8)}
  ${t(30, yEnd + 30, "Subtotal")}${t(W - 30, yEnd + 30, m(bill.subtotal), { anchor: "end" })}
  ${t(30, yEnd + 54, bill.taxLabel, { size: 15 })}${t(W - 30, yEnd + 54, m(bill.tax), { size: 15, anchor: "end" })}
  ${t(30, yEnd + 88, "TOTAL", { size: 20, weight: "bold" })}${t(W - 30, yEnd + 88, m(bill.total), { size: 20, weight: "bold", anchor: "end" })}
  ${dash(yEnd + 106)}
  ${t(W / 2, yEnd + 138, bill.footer.slice(0, 44), { size: 14, anchor: "middle" })}
  ${t(W / 2, yEnd + 164, "*** Thank you ***", { size: 14, anchor: "middle" })}
</svg>`;
  return { svg, W, H, fields };
}

const drawBill = (bill) => (bill.layout === "thermal" ? thermalSvg(bill) : invoiceSvg(bill));

// ---------------------------------------------------------------- capture (phone photo / scan / screenshot)

const CAPTURES = {
  photo: (r) => ({ tilt: r.pick([-1, 1]) * r.range(0.6, 2.2), margin: r.int(24, 40), desk: r.pick(DESKS), quality: r.int(70, 85), noise: r.range(1.5, 3), blur: r.pick([0, 0.4, 0.6]), scale: 1 }),
  hires: (r) => ({ tilt: r.pick([-1, 1]) * r.range(0.6, 1.6), margin: r.int(40, 60), desk: r.pick(DESKS), quality: r.int(82, 90), noise: r.range(1.2, 2.2), blur: 0.5, scale: 1.6 }),
  scan: (r) => ({ tilt: r.pick([0, 0, 0.3, -0.3]), margin: 0, desk: "#ffffff", quality: r.int(88, 92), noise: 0.8, blur: 0, scale: 1 }),
  png: () => ({ tilt: 0, margin: 0, desk: "#ffffff", quality: null, noise: 0, blur: 0, scale: 1, format: "png" }),
};

function addNoise(data, channels, sigma, r, alphaAware = false) {
  if (!sigma) return;
  for (let i = 0; i < data.length; i += channels) {
    if (alphaAware && data[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, Math.round(data[i + c] + r.gauss() * sigma)));
  }
}

/**
 * Renders the bill, tilts it on a desk, adds sensor noise/blur and saves it like a camera would.
 * Returns the file plus `map`, which turns bill coordinates into pixel coordinates of the final image
 * (so an edit can be pasted exactly over a field, as a forger would on the real photo).
 */
async function capture(doc, opts, r, exif) {
  const docPng = await sharp(Buffer.from(doc.svg), { density: 72 * opts.scale }).png().toBuffer();
  const dm = await sharp(docPng).metadata();
  let layer = docPng;
  let Wr = dm.width;
  let Hr = dm.height;
  if (opts.tilt) {
    layer = await sharp(docPng).rotate(opts.tilt, { background: opts.desk }).png().toBuffer();
    const rm = await sharp(layer).metadata();
    Wr = rm.width;
    Hr = rm.height;
  }
  const M = opts.margin;
  const width = Wr + 2 * M;
  const height = Hr + 2 * M;
  const layers = [{ input: layer, left: M, top: M }];
  if (opts.shade) {
    const shade = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9c4bb"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
    layers.push({ input: Buffer.from(shade), blend: "multiply" });
  }
  const { data, info } = await sharp({ create: { width, height, channels: 3, background: opts.desk } })
    .composite(layers)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  addNoise(data, info.channels, opts.noise, r);
  let img = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
  if (opts.blur) img = img.blur(opts.blur);
  const buffer = opts.format === "png" ? await img.png().toBuffer() : await withExif(img.jpeg({ quality: opts.quality }), exif).toBuffer();
  const sx = dm.width / doc.W;
  const sy = dm.height / doc.H;
  const theta = ((opts.tilt ?? 0) * Math.PI) / 180;
  const map = (x, y) => {
    const X = x * sx - dm.width / 2;
    const Y = y * sy - dm.height / 2;
    return [Wr / 2 + X * Math.cos(theta) - Y * Math.sin(theta) + M, Hr / 2 + X * Math.sin(theta) + Y * Math.cos(theta) + M];
  };
  return { buffer, map, opts, scale: sx };
}

function withExif(img, exif) {
  if (!exif) return img;
  const ifd0 = {};
  const ifd2 = {};
  if (exif.make) ifd0.Make = exif.make;
  if (exif.model) ifd0.Model = exif.model;
  if (exif.software) ifd0.Software = exif.software;
  if (exif.modified) ifd0.DateTime = exif.modified;
  if (exif.captured) ifd2.DateTimeOriginal = exif.captured;
  return img.withExif({ IFD0: ifd0, ...(exif.captured ? { IFD2: ifd2 } : {}) });
}

function cameraExif(r, dateIso) {
  const [make, model] = r.pick(PHONES);
  const stamp = exifStamp(dateIso, r.int(9, 20), r.int(0, 59));
  return { make, model, captured: stamp, modified: stamp };
}

/** Median colour of the brighter half of a region: the paper colour a careful forger would pick. */
async function paperColour(buffer, left, top, width, height) {
  const meta = await sharp(buffer).metadata();
  const l = Math.max(0, Math.round(left));
  const t = Math.max(0, Math.round(top));
  const region = { left: l, top: t, width: Math.max(4, Math.min(Math.round(width), meta.width - l)), height: Math.max(4, Math.min(Math.round(height), meta.height - t)) };
  const { data, info } = await sharp(buffer).extract(region).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = [];
  for (let i = 0; i < data.length; i += info.channels) px.push([data[i], data[i + 1], data[i + 2]]);
  px.sort((a, b) => b[0] + b[1] + b[2] - (a[0] + a[1] + a[2]));
  const bright = px.slice(0, Math.max(1, Math.floor(px.length / 2)));
  const med = (c) => bright.map((p) => p[c]).sort((a, b) => a - b)[Math.floor(bright.length / 2)];
  return `rgb(${med(0)},${med(1)},${med(2)})`;
}

/**
 * Pastes new text over fields of an already-captured photo and re-saves it, the way a forger edits a bill.
 * "sloppy": another font, pure black, a flat white patch. "careful": same font and colour, paper colour
 * sampled from the photo, matching noise and blur, saved at about the original quality.
 */
async function pasteEdits(cap, doc, edits, style, r) {
  const composites = [];
  for (const e of edits) {
    const box = e.box;
    const font = style === "sloppy" ? SERIF : box.font;
    const size = style === "sloppy" ? box.size + 1 : box.size;
    const fillColour = style === "sloppy" ? "#000000" : box.fill;
    const w = Math.ceil(Math.max(textWidth(box.text, box.size, box.font, box.weight), textWidth(e.text, size, font, box.weight)) + 16);
    let left = box.anchor === "end" ? box.x + 6 - w : box.x - 6;
    let width = w;
    if (box.anchor === "end" && box.minX != null && left < box.minX) {
      left = box.minX;
      width = box.x + 6 - left;
    }
    const top = box.y - Math.round(box.size * 1.05) - 3;
    const height = Math.round(box.size * 1.45) + 6;
    let bg = "#ffffff";
    if (style === "careful") {
      const [x0, y0] = cap.map(left, top);
      const [x1, y1] = cap.map(left + width, top + height);
      bg = await paperColour(cap.buffer, Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
    const patch = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${bg}"/>${T(box.x - left, box.y - top, e.text, { size, weight: box.weight, fill: fillColour, anchor: box.anchor, font })}</svg>`;
    let png = await sharp(Buffer.from(patch), { density: 72 * cap.opts.scale }).ensureAlpha().png().toBuffer();
    if (style === "careful") {
      const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
      addNoise(data, info.channels, cap.opts.noise, r, true);
      let p = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
      if (cap.opts.blur) p = p.blur(cap.opts.blur);
      png = await p.png().toBuffer();
    }
    if (cap.opts.tilt) png = await sharp(png).rotate(cap.opts.tilt, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const pm = await sharp(png).metadata();
    const [cx, cy] = cap.map(left + width / 2, top + height / 2);
    composites.push({ input: png, left: Math.round(cx - pm.width / 2), top: Math.round(cy - pm.height / 2) });
  }
  return sharp(cap.buffer).composite(composites);
}

// ---------------------------------------------------------------- the dataset

/**
 * The items, in definition order (the processing order is shuffled later). age = days before today.
 * who: holder (the account holder), dependant (same family name), initial ("P. Sharma"), other (a stranger).
 */
const DEFS = [
  // genuine: recent, right purpose, plausible amount, clean capture
  { id: "g01-hospital-photo", cls: "genuine", t: "hospital", vault: "health", age: 6, cap: "photo", exif: true, who: "holder" },
  { id: "g02-pharmacy-receipt", cls: "genuine", t: "pharmacy", vault: "health", age: 2, cap: "photo", who: "holder" },
  { id: "g03-lab-scan", cls: "genuine", t: "lab", vault: "health", age: 15, cap: "scan", who: "holder" },
  { id: "g04-dental-stamped", cls: "genuine", t: "dental", vault: "health", age: 21, cap: "photo", exif: true, shade: true, stamp: true, who: "holder" },
  { id: "g05-hospital-110d", cls: "genuine", t: "hospital", vault: "health", age: 110, cap: "photo", exif: true, who: "holder", note: "110 days old, inside the 120-day window" },
  { id: "g06-tuition-dependant", cls: "genuine", t: "tuition", vault: "education", age: 9, cap: "photo", who: "dependant" },
  { id: "g07-school-scan", cls: "genuine", t: "school", vault: "education", age: 30, cap: "scan", who: "dependant", signature: true },
  { id: "g08-bookstore-receipt", cls: "genuine", t: "bookstore", vault: "education", age: 4, cap: "photo", who: "holder", partial: 0.8 },
  { id: "g09-rent-photo", cls: "genuine", t: "rent", vault: "housing", age: 12, cap: "photo", exif: true, who: "holder" },
  { id: "g10-deposit-ereceipt", cls: "genuine", t: "deposit", vault: "housing", age: 18, cap: "png", who: "holder" },
  { id: "g11-rent-initials", cls: "genuine", t: "rent", vault: "housing", age: 40, cap: "scan", who: "initial", signature: true },
  { id: "g12-plumbing-repair", cls: "genuine", t: "plumbing", vault: "emergency", age: 3, cap: "photo", stamp: true, who: "holder" },
  { id: "g13-towing", cls: "genuine", t: "towing", vault: "emergency", age: 1, cap: "photo", exif: true, who: "holder" },
  { id: "g14-hospital-emergency-vault", cls: "genuine", t: "hospital", vault: "emergency", age: 5, cap: "photo", shade: true, who: "dependant" },
  { id: "g15-pension-statement", cls: "genuine", t: "pension", vault: "retirement", age: 25, cap: "scan", who: "holder" },
  { id: "g16-lab-hires", cls: "genuine", t: "lab", vault: "health", age: 8, cap: "hires", exif: true, who: "holder", partial: 0.6 },

  // edited: a real-looking bill with a pasted patch (or, e09, re-typeset from scratch)
  { id: "e01-total-sloppy", cls: "edited", t: "hospital", vault: "health", age: 7, cap: "photo", who: "holder", edit: { kind: "total", style: "sloppy", factor: 3.2, quality: 95 } },
  { id: "e02-total-sloppy-photoshop", cls: "edited", t: "tuition", vault: "education", age: 10, cap: "scan", who: "holder", edit: { kind: "total", style: "sloppy", factor: 1.8, quality: 92, software: "Adobe Photoshop 25.1 (Windows)" } },
  { id: "e03-amount-consistent-sloppy", cls: "edited", t: "rent", vault: "housing", age: 14, cap: "photo", who: "holder", edit: { kind: "amount", style: "sloppy", factor: 2.5, quality: 93 } },
  { id: "e04-amount-consistent-careful", cls: "edited", t: "hospital", vault: "health", age: 11, cap: "photo", who: "holder", edit: { kind: "amount", style: "careful", factor: 2 } },
  { id: "e05-name-sloppy", cls: "edited", t: "dental", vault: "health", age: 9, cap: "photo", who: "other", edit: { kind: "name", style: "sloppy", quality: 95 } },
  { id: "e06-name-careful", cls: "edited", t: "plumbing", vault: "emergency", age: 6, cap: "photo", who: "other", edit: { kind: "name", style: "careful" } },
  { id: "e07-date-sloppy-exif", cls: "edited", t: "hospital", vault: "health", age: 200, cap: "photo", exif: true, who: "holder", edit: { kind: "date", style: "sloppy", newAge: 9, quality: 94, keepExif: true, software: "Adobe Photoshop 25.1 (Windows)" } },
  { id: "e08-date-careful", cls: "edited", t: "school", vault: "education", age: 260, cap: "scan", who: "dependant", edit: { kind: "date", style: "careful", newAge: 12 } },
  { id: "e09-fabricated-retyped", cls: "edited", t: "deposit", vault: "housing", age: 16, cap: "photo", who: "holder", edit: { kind: "fabricated", factor: 2.2 } },
  { id: "e10-total-careful-receipt", cls: "edited", t: "pharmacy", vault: "health", age: 3, cap: "photo", who: "holder", edit: { kind: "total", style: "careful", factor: 4 } },

  // duplicate: a bill already submitted (above) sent again
  { id: "d01-exact-resubmit", cls: "duplicate", dupOf: "g01-hospital-photo", how: "exact" },
  { id: "d02-exact-other-account", cls: "duplicate", dupOf: "g09-rent-photo", how: "exact", otherAccount: true },
  { id: "d03-reencoded", cls: "duplicate", dupOf: "g02-pharmacy-receipt", how: "reencode" },
  { id: "d04-resized", cls: "duplicate", dupOf: "g06-tuition-dependant", how: "resize" },
  { id: "d05-png-screenshot", cls: "duplicate", dupOf: "g12-plumbing-repair", how: "png" },
  { id: "d06-rephotographed", cls: "duplicate", dupOf: "g04-dental-stamped", how: "rephoto" },

  // wrong-purpose: a real-looking bill for something the vault doesn't cover
  { id: "w01-restaurant-health", cls: "wrong-purpose", t: "restaurant", vault: "health", age: 2, cap: "photo", who: "holder" },
  { id: "w02-electronics-education", cls: "wrong-purpose", t: "electronics", vault: "education", age: 8, cap: "photo", who: "holder" },
  { id: "w03-clothing-housing", cls: "wrong-purpose", t: "clothing", vault: "housing", age: 5, cap: "photo", who: "holder" },
  { id: "w04-resort-emergency", cls: "wrong-purpose", t: "hotel", vault: "emergency", age: 12, cap: "scan", who: "holder" },
  { id: "w05-hospital-education", cls: "wrong-purpose", t: "hospital", vault: "education", age: 10, cap: "photo", who: "holder" },
  { id: "w06-rent-health", cls: "wrong-purpose", t: "rent", vault: "health", age: 7, cap: "photo", who: "holder" },
  { id: "w07-jewellery-retirement", cls: "wrong-purpose", t: "jewellery", vault: "retirement", age: 20, cap: "scan", who: "holder" },

  // stale: older than India's 120-day limit
  { id: "s01-hospital-125d", cls: "stale", t: "hospital", vault: "health", age: 125, cap: "photo", who: "holder" },
  { id: "s02-tuition-160d", cls: "stale", t: "tuition", vault: "education", age: 160, cap: "scan", who: "dependant" },
  { id: "s03-rent-210d-exif", cls: "stale", t: "rent", vault: "housing", age: 210, cap: "photo", exif: true, who: "holder" },
  { id: "s04-pharmacy-300d", cls: "stale", t: "pharmacy", vault: "health", age: 300, cap: "photo", who: "holder" },
  { id: "s05-repair-420d", cls: "stale", t: "plumbing", vault: "emergency", age: 420, cap: "scan", who: "holder" },
];

/**
 * The bundled sample bills (mobile/assets/samples, read-only). Their dates are printed on them, fixed in October 2026,
 * so their class is worked out from today's date: a genuine one turns "stale" once it is past the age limit.
 * Fields were read off the images (and match src/lib/samples.ts for "Alex Morgan" in INR on 2026-10-10).
 */
const MEDICAL_ITEMS = [
  ["Cardiology consultation", 1200000],
  ["Electrocardiogram (ECG)", 680000],
  ["Comprehensive blood panel", 500000],
];
const MOBILE = [
  { id: "m01-sample-pharmacy", file: "pharmacy-receipt.jpg", cls: "genuine", vault: "health", issuer: "Greenleaf Pharmacy", issuerLine: "Licensed Pharmacy #4471 · 12 Market Street", title: "Pharmacy Receipt", documentType: "pharmacy_receipt", category: "health", reference: "RX-88287", date: "2026-10-08", billedLabel: "PATIENT", recipient: "Alex Morgan", items: [["Amoxicillin 500 mg (prescription)", 145600], ["Ibuprofen 400 mg x 30", 63920], ["Digital blood pressure monitor", 416000]], tax: 65680, footer: "Prescription filled by R. Okafor, PharmD." },
  { id: "m02-sample-rent", file: "rent-receipt.jpg", cls: "genuine", vault: "housing", issuer: "Harbor View Apartments", issuerLine: "Property Management Office · Unit 4B", title: "Rent Receipt", documentType: "rent_receipt", category: "housing", reference: "RR-3359", date: "2026-10-07", billedLabel: "TENANT", recipient: "Alex Morgan", items: [["Monthly rent — Unit 4B", 8800000], ["Maintenance charge", 800000]], tax: 0, footer: "Received with thanks by the landlord's agent. Lease ref HV-2025-118." },
  { id: "m03-sample-tuition", file: "tuition-invoice.jpg", cls: "genuine", vault: "education", issuer: "Riverside University", issuerLine: "Office of the Bursar · Student Accounts", title: "Tuition Fee Invoice — Fall Semester", documentType: "tuition_invoice", category: "education", reference: "BUR-560200", date: "2026-10-04", billedLabel: "STUDENT", recipient: "Maya Morgan", items: [["Undergraduate tuition (12 credits)", 18400000], ["Laboratory fee", 1200000]], tax: 0, footer: "Enrolment is confirmed on receipt of payment." },
  { id: "m04-sample-coffee", file: "coffee-receipt.jpg", cls: "wrong-purpose", vault: "health", issuer: "Brew & Co. Coffee", issuerLine: "Downtown Roastery", title: "Sales Receipt", documentType: "retail_receipt", category: "other", reference: "S-4465", date: "2026-10-09", billedLabel: null, recipient: null, items: [["Oat latte (large)", 42000], ["Almond croissant", 32800]], tax: 0, footer: "Free wifi: BrewGuest." },
  { id: "m05-sample-old", file: "old-invoice.jpg", cls: "genuine", vault: "health", issuer: "City General Hospital", issuerLine: "Outpatient Billing · 400 Lakeshore Ave", title: "Patient Invoice", documentType: "medical_invoice", category: "health", reference: "INV-17402", date: "2025-12-14", billedLabel: "PATIENT", recipient: "Alex Morgan", items: MEDICAL_ITEMS, tax: 0, footer: "Payment due within 30 days. Insurance claims ref: OP-55120." },
  { id: "m06-sample-tampered", file: "tampered-invoice.jpg", cls: "edited", vault: "health", issuer: "City General Hospital", issuerLine: "Outpatient Billing · 400 Lakeshore Ave", title: "Patient Invoice", documentType: "medical_invoice", category: "health", reference: "INV-20995", date: "2026-10-06", billedLabel: "PATIENT", recipient: "Alex Morgan", items: MEDICAL_ITEMS, tax: 0, visibleTotal: 10380000, footer: "Payment due within 30 days. Insurance claims ref: OP-55120.", note: "Total pasted over in a crisper bold font (₹23,800.00 → ₹1,03,800.00)" },
];

function recipientFor(who, holder, r) {
  const surname = holder.split(" ").at(-1);
  if (who === "dependant") return `${r.pick(DEPENDANTS)} ${surname}`;
  if (who === "initial") return `${holder[0]}. ${surname}`;
  if (who === "other") return r.pick(STRANGERS);
  return holder;
}

function sha256File(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Builds every item, writes the images and manifest.json into outDir, and returns the manifest. */
export async function generate({ outDir = DEFAULT_DATASET_DIR, today = new Date().toISOString().slice(0, 10) } = {}) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const built = new Map(); // id → { item, doc, bill, capOpts, buffer, r }
  const items = [];

  const save = async (item, buffer) => {
    const ext = item.mime === "image/png" ? "png" : "jpg";
    item.file = `${item.id}.${ext}`;
    item.sha256 = sha256File(buffer);
    item.bytes = buffer.length;
    fs.writeFileSync(path.join(outDir, item.file), buffer);
    items.push(item);
  };

  for (const def of DEFS.filter((d) => !d.dupOf)) {
    const r = rng(def.id);
    const holder = r.pick(PEOPLE);
    const recipient = recipientFor(def.who ?? "holder", holder, r);
    const bill = buildBill(def.t, r, { date: isoDaysAgo(today, def.age), recipient, scale: def.edit?.kind === "fabricated" ? def.edit.factor : 1 });
    bill.stamp = !!def.stamp;
    bill.signature = !!def.signature;
    const doc = drawBill(bill);
    const capOpts = { ...CAPTURES[def.cap](r), shade: !!def.shade };
    const exif = def.exif && capOpts.format !== "png" ? cameraExif(r, isoDaysAgo(today, def.age - r.int(0, 1))) : null;
    const cap = await capture(doc, capOpts, r, exif);
    const visible = visibleFields(bill);
    const edits = [];
    let buffer = cap.buffer;
    let note = def.note ?? "";

    if (def.edit && def.edit.kind !== "fabricated") {
      const e = def.edit;
      const f = doc.fields;
      const patches = [];
      if (e.kind === "total" || e.kind === "amount") {
        const newTotal = Math.round((bill.total * e.factor) / 1000) * 1000;
        const delta = newTotal - bill.total;
        patches.push({ box: f.total, text: money(newTotal, bill.moneyStyle) });
        edits.push(`total ${money(bill.total)} → ${money(newTotal)}`);
        visible.total = newTotal / 100;
        if (e.kind === "amount") {
          const k = bill.items.reduce((best, it, i) => (it.amount > bill.items[best].amount ? i : best), 0);
          const newLine = bill.items[k].amount + delta;
          patches.push({ box: f.items[k], text: money(newLine, bill.moneyStyle) }, { box: f.subtotal, text: money(bill.subtotal + delta, bill.moneyStyle) });
          visible.lineItems[k].amount = newLine / 100;
          visible.subtotal = (bill.subtotal + delta) / 100;
          edits.push(`line "${bill.items[k].description}" and subtotal raised to match`);
        }
      } else if (e.kind === "name") {
        const label = bill.layout === "thermal" ? `${bill.billedLabel}: ` : "";
        patches.push({ box: f.name, text: `${label}${holder}` });
        edits.push(`name "${bill.recipient}" → "${holder}"`);
        visible.recipient = holder;
      } else if (e.kind === "date") {
        const newDate = isoDaysAgo(today, e.newAge);
        const suffix = bill.layout === "thermal" ? `  ${bill.time ?? "18:42"}` : "";
        patches.push({ box: f.date, text: `Date: ${showDate(newDate, bill.dateFormat)}${suffix}` });
        edits.push(`date ${bill.date} → ${newDate}`);
        visible.date = newDate;
      }
      const pasted = await pasteEdits(cap, doc, patches, e.style, r);
      const quality = e.quality ?? Math.min(95, (capOpts.quality ?? 90) + r.int(-2, 2));
      let editorExif = null;
      if (e.keepExif && exif) editorExif = { ...exif, software: e.software, modified: exifStamp(isoDaysAgo(today, 1), 22, 15) };
      else if (e.software) editorExif = { software: e.software, modified: exifStamp(isoDaysAgo(today, 1), 22, 15) };
      buffer = await withExif(pasted.jpeg({ quality }), editorExif).toBuffer();
      edits.push(`${e.style} patch (${e.style === "sloppy" ? "serif font, pure black, flat white background" : "same font and colour, sampled paper colour, matched noise"}), re-saved at JPEG q${quality}`);
      if (editorExif) edits.push(`EXIF: ${e.keepExif ? "camera metadata kept, " : ""}Software "${e.software}"`);
    } else if (def.edit?.kind === "fabricated") {
      edits.push(`whole bill re-typeset with every amount ×${def.edit.factor} (no pasted region), then photographed normally`);
    }

    const requested = def.cls === "genuine" && def.partial ? Math.round((bill.total * def.partial) / 100) * 100 : Math.round(visible.total * 100);
    const item = {
      id: def.id,
      class: def.cls,
      expected: EXPECTED[def.cls],
      source: "synthetic",
      template: def.t,
      vault: def.vault,
      capture: def.cap + (def.shade ? "+shade" : "") + (def.stamp ? "+stamp" : "") + (exif ? "+exif" : ""),
      captureDetail: {
        tilt: Number((capOpts.tilt ?? 0).toFixed(2)),
        quality: capOpts.quality,
        noise: Number(capOpts.noise.toFixed(2)),
        blur: capOpts.blur,
        scale: capOpts.scale,
        font: bill.font.split(",")[0],
      },
      description: describe(def, bill, today, note),
      edits,
      user: { key: `u-${def.id}`, name: holder },
      requested,
      mime: capOpts.format === "png" ? "image/png" : "image/jpeg",
      ageDays: def.age,
      visible,
    };
    await save(item, buffer);
    built.set(def.id, { item, doc, bill, capOpts, buffer, r });
  }

  for (const def of DEFS.filter((d) => d.dupOf)) {
    const orig = built.get(def.dupOf);
    if (!orig) throw new Error(`${def.id}: unknown original ${def.dupOf}`);
    const r = rng(def.id);
    let buffer = orig.buffer;
    let mime = orig.item.mime;
    let how = "byte-identical copy";
    if (def.how === "reencode") {
      buffer = await sharp(orig.buffer).jpeg({ quality: 60 }).toBuffer();
      how = "re-encoded at JPEG q60";
    } else if (def.how === "resize") {
      const meta = await sharp(orig.buffer).metadata();
      buffer = await sharp(orig.buffer).resize(Math.round(meta.width * 0.7)).jpeg({ quality: 85 }).toBuffer();
      how = "resized to 70% and re-encoded";
    } else if (def.how === "png") {
      buffer = await sharp(orig.buffer).png().toBuffer();
      mime = "image/png";
      how = "converted to PNG (screenshot)";
    } else if (def.how === "rephoto") {
      const capOpts = { ...CAPTURES.photo(r), shade: !orig.capOpts.shade };
      buffer = (await capture(orig.doc, capOpts, r, null)).buffer;
      how = "the same paper bill photographed again (new angle, light and compression)";
    }
    const item = {
      id: def.id,
      class: def.cls,
      expected: EXPECTED[def.cls],
      source: "synthetic",
      template: orig.item.template,
      vault: orig.item.vault,
      capture: def.how,
      description: `${how} of ${def.dupOf}${def.otherAccount ? ", sent from a different account" : ", sent again by the same account"}`,
      edits: [],
      duplicateOf: def.dupOf,
      user: def.otherAccount ? { key: `u-${def.id}`, name: rng(`${def.id}-person`).pick(PEOPLE) } : orig.item.user,
      requested: orig.item.requested,
      mime,
      ageDays: orig.item.ageDays,
      visible: orig.item.visible,
    };
    await save(item, buffer);
  }

  for (const s of MOBILE) {
    const src = path.join(MOBILE_SAMPLES, s.file);
    if (!fs.existsSync(src)) {
      console.warn(`[generate] skipping ${s.id}: ${path.relative(ROOT, src)} not found`);
      continue;
    }
    const age = ageInDays(today, s.date);
    const cls = s.cls === "genuine" && age > MAX_DOC_AGE_DAYS ? "stale" : s.cls;
    const subtotal = s.items.reduce((a, [, p]) => a + p, 0);
    const total = s.visibleTotal ?? subtotal + s.tax;
    const item = {
      id: s.id,
      class: cls,
      expected: EXPECTED[cls],
      source: "mobile-sample",
      template: s.file.replace(/\.jpg$/, ""),
      vault: s.vault,
      capture: "bundled sample",
      description: `mobile/assets/samples/${s.file}, dated ${s.date} (${age} days old)${s.note ? `; ${s.note}` : ""}`,
      edits: s.note ? [s.note] : [],
      user: { key: `u-${s.id}`, name: "Alex Morgan" },
      requested: total,
      mime: "image/jpeg",
      ageDays: age,
      visible: {
        issuer: s.issuer,
        documentType: s.documentType,
        category: s.category,
        recipient: s.recipient,
        date: s.date,
        total: total / 100,
        subtotal: subtotal / 100,
        tax: s.tax / 100,
        currency: CURRENCY,
        reference: s.reference,
        lineItems: s.items.map(([description, p]) => ({ description, amount: p / 100 })),
        text: [s.issuer, s.issuerLine, s.title, s.billedLabel && s.recipient ? `${s.billedLabel} ${s.recipient}` : "", ...s.items.map(([d]) => d), s.footer].filter(Boolean).join(" · "),
      },
    };
    await save(item, fs.readFileSync(src));
  }

  const ordered = processingOrder(items);
  const counts = {};
  for (const it of ordered) counts[it.class] = (counts[it.class] ?? 0) + 1;
  const manifest = {
    name: "vaultwise-verification-eval",
    version: 1,
    today,
    seed: SEED,
    market: MARKET,
    currency: CURRENCY,
    maxDocAgeDays: MAX_DOC_AGE_DAYS,
    expected: EXPECTED,
    counts,
    items: ordered,
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function describe(def, bill, today, note) {
  const what = `${TEMPLATES[def.t].documentType.replace(/_/g, " ")} from ${bill.issuer}`;
  const cap = { photo: "phone photo", hires: "high-resolution phone photo", scan: "flat scan", png: "PNG e-receipt" }[def.cap];
  return `${what}, ${cap}, ${def.age} days old, for a ${def.vault} vault${note ? `; ${note}` : ""}`;
}

/** Seeded shuffle, then each duplicate is moved to just after a later point than its original. */
function processingOrder(items) {
  const r = rng("processing-order");
  const base = r.shuffle(items.filter((i) => !i.duplicateOf));
  for (const dup of items.filter((i) => i.duplicateOf)) {
    const at = base.findIndex((i) => i.id === dup.duplicateOf);
    const pos = r.int(at + 1, base.length);
    base.splice(pos, 0, dup);
  }
  return base;
}

// ---------------------------------------------------------------- CLI

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const outArg = process.argv.indexOf("--out");
  const outDir = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : DEFAULT_DATASET_DIR;
  const t0 = Date.now();
  const manifest = await generate({ outDir });
  console.log(
    `Wrote ${manifest.items.length} bills to ${path.relative(process.cwd(), outDir) || "."} (${Object.entries(manifest.counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(", ")}) as of ${manifest.today} in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}
