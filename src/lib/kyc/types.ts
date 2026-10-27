import type { DocType } from "./ids";

export type KycStatus = "pending" | "verified" | "needs_review" | "rejected";

/** One automated check, shown to the reviewer (same shape as proof verification checks). */
export interface KycCheck {
  label: string;
  status: "pass" | "warn" | "fail" | "info";
  detail: string;
}

export interface KycInput {
  /** The account being verified. */
  user: { id: string; name: string; market: string };
  docType: DocType;
  file: { buffer: Buffer; mime: string };
  /** The number the person typed, if any. */
  idNumber?: string | null;
}

export interface KycResult {
  status: KycStatus;
  /** Normalised full number, or null if none could be read. Kept in memory only: hash it, keep last 4. */
  number: string | null;
  nameOnDoc: string | null;
  dob: string | null;
  checks: KycCheck[];
  /** Plain sentences the customer may see. */
  reasons: string[];
  /** The provider's own reference for this check, if it has one. */
  reference?: string | null;
}

/**
 * Anything that can check an ID. `practice` (default) uses the vision model plus format and image checks;
 * an official provider (DigiLocker through a licensed partner, HyperVerge, IDfy, Signzy) implements the
 * same interface. See README.md.
 */
export interface KycProvider {
  name: string;
  verify(input: KycInput): Promise<KycResult>;
}
