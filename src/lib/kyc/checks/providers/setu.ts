import { HttpError } from "../../../users";
import { checksConfigError, checksTestAllowed } from "../config";
import type { BankResult, BankVerifier, CheckProviders, DigiLockerClient, DigiLockerResult, PanVerifier } from "../types";

/**
 * Setu (https://docs.setu.co): PAN verification, DigiLocker and reverse penny drop (KYC_CHECKS_PROVIDER=setu).
 *
 * STATUS: written from Setu's public docs (November 2026), not yet run against the sandbox. Check each call
 * with sandbox keys before relying on it (see README.md, "Trying the Setu sandbox").
 *
 * Env: SETU_CLIENT_ID, SETU_CLIENT_SECRET, one product instance id per product
 * (SETU_PAN_PRODUCT_INSTANCE_ID, SETU_DIGILOCKER_PRODUCT_INSTANCE_ID, SETU_RPD_PRODUCT_INSTANCE_ID, each
 * falling back to SETU_PRODUCT_INSTANCE_ID), and SETU_BASE_URL (default the sandbox; required, and not the
 * sandbox unless KYC_CHECKS_TEST_ALLOWED=true, with NODE_ENV=production: see setuBaseUrl()).
 *
 * Least data: Setu's answers carry the full bank account number, the Aadhaar address, photo and XML link.
 * This file keeps only names, the year of birth, IFSC and last 4 characters, and never logs a response body.
 */

export const SETU_SANDBOX = "https://dg-sandbox.setu.co";
export const SETU_PRODUCTION = "https://dg.setu.co";
const TIMEOUT_MS = 15_000;
const PAN_REASON = "Verifying the customer's identity before opening a Vaultwise savings wallet (KYC).";

type Product = "pan" | "digilocker" | "rpd";
const INSTANCE_ENV: Record<Product, string> = {
  pan: "SETU_PAN_PRODUCT_INSTANCE_ID",
  digilocker: "SETU_DIGILOCKER_PRODUCT_INSTANCE_ID",
  rpd: "SETU_RPD_PRODUCT_INSTANCE_ID",
};

const unavailable = () => new HttpError(503, "ID checks aren't available right now. Try again in a few minutes.", "provider_unavailable");

function env(name: string) {
  return process.env[name]?.trim() || "";
}

/** True for Setu's sandbox host (dg-sandbox.setu.co), which answers with sample data. */
export function isSetuSandbox(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().startsWith("dg-sandbox.");
  } catch {
    return false;
  }
}

/**
 * Where Setu is called. Outside production SETU_BASE_URL defaults to the sandbox. With NODE_ENV=production
 * it must be set explicitly to an https URL, and the sandbox is refused unless KYC_CHECKS_TEST_ALLOWED=true
 * (a test-mode deployment): 500 `server_config`, like the test provider's production refusal.
 */
export function setuBaseUrl(e: Readonly<Record<string, string | undefined>> = process.env): string {
  const set = (e.SETU_BASE_URL?.trim() ?? "").replace(/\/+$/, "");
  if (e.NODE_ENV === "production") {
    if (!set) throw checksConfigError(`SETU_BASE_URL is not set on a production server. Set it to ${SETU_PRODUCTION} (or the sandbox with KYC_CHECKS_TEST_ALLOWED=true for a test-mode deployment).`);
    let https = false;
    try {
      https = new URL(set).protocol === "https:";
    } catch {
      https = false;
    }
    if (!https) throw checksConfigError("SETU_BASE_URL must be an https URL on a production server.");
    if (isSetuSandbox(set) && !checksTestAllowed(e))
      throw checksConfigError(`SETU_BASE_URL is Setu's sandbox on a production server. Set it to ${SETU_PRODUCTION}, or KYC_CHECKS_TEST_ALLOWED=true for a test-mode deployment.`);
  }
  return set || SETU_SANDBOX;
}

function credentials(product: Product) {
  const base = setuBaseUrl();
  const clientId = env("SETU_CLIENT_ID");
  const secret = env("SETU_CLIENT_SECRET");
  const instance = env(INSTANCE_ENV[product]) || env("SETU_PRODUCT_INSTANCE_ID");
  if (!clientId || !secret || !instance) {
    const missing = [!clientId && "SETU_CLIENT_ID", !secret && "SETU_CLIENT_SECRET", !instance && INSTANCE_ENV[product]].filter(Boolean).join(", ");
    console.error(`[kyc-checks] Setu is not set up: missing ${missing}.`);
    throw unavailable();
  }
  return { clientId, secret, instance, base };
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Calls Setu. Answers any 2xx-4xx as { status, data }; a network failure, timeout or 5xx is 503 provider_unavailable. */
async function setu(product: Product, method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; data: Json }> {
  const c = credentials(product);
  let res: Response;
  try {
    res = await fetch(`${c.base}${path}`, {
      method,
      headers: {
        "x-client-id": c.clientId,
        "x-client-secret": c.secret,
        "x-product-instance-id": c.instance,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    console.error(`[kyc-checks] Setu ${product} ${method} failed: ${(e as Error)?.name ?? "error"}`);
    throw unavailable();
  }
  let data: Json = {};
  try {
    data = obj(await res.json()) ?? {};
  } catch {
    data = {};
  }
  if (res.status >= 500) {
    // Only the error code and trace id: bodies can hold personal data.
    const err = obj(data.error);
    console.error(`[kyc-checks] Setu ${product} answered ${res.status} ${str(err?.code) ?? ""} trace ${str(err?.traceId) ?? str(data.traceId) ?? "-"}`);
    throw unavailable();
  }
  return { status: res.status, data };
}

function errorCode(data: Json): string | null {
  return str(obj(data.error)?.code) ?? str(data.code);
}

/** A 4xx we didn't expect means our request is wrong: log the code, tell the customer to try later. */
function unexpected(product: Product, status: number, data: Json): never {
  console.error(`[kyc-checks] Setu ${product} refused the request: ${status} ${errorCode(data) ?? ""}`);
  throw unavailable();
}

/** Setu's times are ISO 8601; the reverse penny drop's have no offset, read here as India time (+05:30). */
export function setuTime(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  const withZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}+05:30`;
  const t = Date.parse(withZone);
  return Number.isFinite(t) ? t : null;
}

/** The last 4 digits of a masked or full number ("xxxx-xxxx-1234", "9009120939129"). Never more. */
export function lastDigits(v: unknown): string | null {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** "01-01-1990" (DD-MM-YYYY) or "1990-01-01" → 1990. */
export function yearOf(v: unknown): number | null {
  const m = /\b(\d{4})\b/.exec(String(v ?? ""));
  const y = m ? Number(m[1]) : NaN;
  return y > 1900 && y < 2100 ? y : null;
}

/* ---------- PAN: POST /api/verify/pan ---------- */

/** Sandbox answers come from Setu's shared test data (PAN ABCDE1234A is valid, ABCDE1234B invalid, others not found). */
const onSandbox = () => isSetuSandbox(env("SETU_BASE_URL") || SETU_SANDBOX);

export const setuPan: PanVerifier = {
  name: "setu",
  async verify(pan) {
    const { status, data } = await setu("pan", "POST", "/api/verify/pan", { pan, consent: "Y", reason: PAN_REASON });
    const sample = onSandbox();
    if (status === 404) return { status: "not_found", registeredName: null, reference: str(data.traceId), sample };
    if (status !== 200) unexpected("pan", status, data);
    if (str(data.verification)?.toLowerCase() !== "success") return { status: "invalid", registeredName: null, reference: str(data.traceId), sample };
    const d = obj(data.data) ?? {};
    const parts = [d.first_name, d.middle_name, d.last_name].map(str).filter(Boolean).join(" ");
    return { status: "valid", registeredName: str(d.full_name) ?? (parts || null), reference: str(data.traceId), sample };
  },
};

/* ---------- DigiLocker: POST /api/digilocker/, GET /:id/status, GET /:id/aadhaar, GET /:id/revoke ---------- */

const path = (id: string, rest: string) => `/api/digilocker/${encodeURIComponent(id)}${rest}`;

export const setuDigiLocker: DigiLockerClient = {
  name: "setu",
  async start({ redirectUrl }) {
    const { status, data } = await setu("digilocker", "POST", "/api/digilocker/", { redirectUrl });
    if (status !== 200 && status !== 201) unexpected("digilocker", status, data);
    const id = str(data.id);
    const url = str(data.url);
    if (!id || !url) unexpected("digilocker", status, data);
    return { requestId: id, url, expiresAt: setuTime(data.validUpto) };
  },
  async finish(id): Promise<DigiLockerResult> {
    const st = await setu("digilocker", "GET", path(id, "/status"));
    if (st.status === 404) return { status: "failed", reason: "This DigiLocker request has expired. Start again." };
    if (st.status === 401) return { status: "waiting" };
    if (st.status !== 200) unexpected("digilocker", st.status, st.data);
    const state = str(st.data.status)?.toLowerCase();
    if (state === "unauthenticated") return { status: "waiting" };
    if (state === "revoked") return { status: "failed", reason: "Sharing from DigiLocker was stopped. Start again." };
    if (state !== "authenticated") unexpected("digilocker", st.status, st.data);

    const a = await setu("digilocker", "GET", path(id, "/aadhaar"));
    if (a.status === 401) return { status: "waiting" };
    if (a.status === 404) return { status: "failed", reason: "This DigiLocker request has expired. Start again." };
    if (a.status === 400)
      return { status: "failed", reason: "We couldn't get your Aadhaar from DigiLocker. Check Aadhaar is linked in DigiLocker and allow sharing it, then try again." };
    if (a.status !== 200) unexpected("digilocker", a.status, a.data);
    const aadhaar = obj(a.data.aadhaar) ?? {};
    const name = str(aadhaar.name);
    if (!name) return { status: "failed", reason: "DigiLocker didn't share a name with us. Start again." };
    const result: DigiLockerResult = { status: "done", name, yearOfBirth: yearOf(aadhaar.dateOfBirth), last4: lastDigits(aadhaar.maskedNumber), reference: id };
    // We have what we keep; give up the access token (best effort).
    await setu("digilocker", "GET", path(id, "/revoke")).catch(() => undefined);
    return result;
  },
};

/* ---------- Reverse penny drop: POST /api/verify/ban/reverse, GET /api/verify/ban/reverse/:id ---------- */

export const setuBank: BankVerifier = {
  name: "setu",
  async reversePennyDrop() {
    const { status, data } = await setu("rpd", "POST", "/api/verify/ban/reverse", {});
    if (status !== 200 && status !== 201) unexpected("rpd", status, data);
    const id = str(data.id);
    const upiLink = str(data.upiLink);
    if (!id || !upiLink) unexpected("rpd", status, data);
    return { requestId: id, upiLink, expiresAt: setuTime(data.validUpto) ?? Date.now() + 10 * 60_000 };
  },
  async result(id): Promise<BankResult> {
    const { status, data } = await setu("rpd", "GET", `/api/verify/ban/reverse/${encodeURIComponent(id)}`);
    if (status === 404) return { status: "failed", reason: "We couldn't find that bank check. Start again." };
    if (status !== 200) unexpected("rpd", status, data);
    const state = str(data.status) ?? "";
    switch (state) {
      case "BAV_REVERSE_PENNY_DROP_CREATED":
        return { status: "waiting" };
      case "BAV_REVERSE_PENNY_DROP_PAYMENT_SUCCESSFUL": {
        const d = obj(data.data) ?? {};
        if (str(d.accountType) === "PPI") return { status: "failed", reason: "That payment came from a wallet, not a bank account. Pay from your bank account with UPI." };
        const holderName = str(d.bankAccountName);
        const ifsc = str(d.bankAccountIfsc);
        const last4 = lastDigits(d.bankAccountNumber);
        if (!holderName || !ifsc || !last4) return { status: "failed", reason: "Your bank didn't share the account details. Try again from another bank account." };
        return { status: "done", holderName, ifsc: ifsc.toUpperCase(), last4, reference: id };
      }
      case "BAV_REVERSE_PENNY_DROP_EXPIRED":
        return { status: "failed", reason: "The payment link expired. Start again." };
      case "BAV_REVERSE_PENNY_DROP_FAILED":
      case "BAV_REVERSE_PENNY_DROP_PAYMENT_FAILED":
        return { status: "failed", reason: "The ₹1 payment didn't go through. Try again." };
      case "BAV_REVERSE_PENNY_DROP_PII_PURGED":
        return { status: "failed", reason: "This bank check is too old. Start again." };
      default:
        return unexpected("rpd", status, data);
    }
  },
};

export const setuProviders: CheckProviders = { pan: setuPan, digilocker: setuDigiLocker, bank: setuBank };
