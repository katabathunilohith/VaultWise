import crypto from "node:crypto";
import { get, run } from "./db";
import { rulesFor } from "./compliance";
import { userAccount } from "./ledger";
import { audit } from "./audit";

export interface User {
  id: string;
  name: string;
  email: string | null;
  jurisdiction: string;
  currency: string;
  kyc_status: string;
  kyc_level: number;
  pin_hash: string | null;
  plan: string;
  risk_profile: string | null;
  satellite_opt_in: number;
  satellite_opted_at: number | null;
  created_at: number;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Single-tenant prototype: the first user is the signed-in customer. */
export function currentUser(): User | undefined {
  return get<User>("SELECT * FROM users ORDER BY created_at ASC LIMIT 1");
}

export function requireUser(): User {
  const u = currentUser();
  if (!u) throw new HttpError(401, "No wallet yet — complete onboarding first");
  return u;
}

export function hashPin(pin: string, salt = crypto.randomBytes(16).toString("hex")) {
  const h = crypto.scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${h}`;
}

export function checkPin(user: User, pin: string | undefined | null) {
  if (!user.pin_hash || !pin) return false;
  const [salt, h] = user.pin_hash.split(":");
  const candidate = crypto.scryptSync(pin, salt, 32);
  return crypto.timingSafeEqual(candidate, Buffer.from(h, "hex"));
}

export function createUser(opts: { id?: string; name: string; email?: string; jurisdiction: string; pin: string; createdAt?: number }) {
  const rules = rulesFor(opts.jurisdiction);
  const id = opts.id ?? `usr_${crypto.randomBytes(6).toString("hex")}`;
  const createdAt = opts.createdAt ?? Date.now();
  run(
    `INSERT INTO users (id, name, email, jurisdiction, currency, kyc_status, kyc_level, pin_hash, created_at)
     VALUES (?, ?, ?, ?, ?, 'verified', 2, ?, ?)`,
    id,
    opts.name,
    opts.email ?? null,
    rules.code,
    rules.currency,
    hashPin(opts.pin),
    createdAt,
  );
  userAccount(id, "bank", rules.currency);
  audit({
    userId: id,
    actor: id,
    actorType: "user",
    action: "user.onboarded",
    entityType: "user",
    entityId: id,
    details: { jurisdiction: rules.code, currency: rules.currency, kyc: "verified (simulated partner check)" },
    ts: createdAt,
  });
  audit({
    userId: id,
    actor: "kyc-partner",
    actorType: "system",
    action: "kyc.verified",
    entityType: "user",
    entityId: id,
    details: { level: 2, checks: ["document", "liveness", "sanctions", "PEP"], provider: "simulated" },
    ts: createdAt + 1000,
  });
  return get<User>("SELECT * FROM users WHERE id = ?", id)!;
}
