import crypto from "node:crypto";
import { compareNames } from "../../names";
import type { BankVerifier, CheckProviders, DigiLockerClient, PanVerifier } from "../types";

/**
 * The test provider (KYC_CHECKS_PROVIDER=test, the default). Deterministic and offline, as the contract
 * in docs/plans/contracts.md says. No real ID is checked, so it is refused on a production server unless
 * KYC_CHECKS_TEST_ALLOWED=true (see config.ts).
 *
 * - PAN `ABCDE1234F` matches any name. `ABCDE0000F` is valid but registered to someone else (a name
 *   mismatch, which goes to a person). Any other well-formed PAN is not found.
 * - DigiLocker completes with the account name, year of birth 1990 and Aadhaar ending 1234. Its "hosted
 *   page" is the redirect URL with DigiLocker's success query, so a browser comes straight back.
 * - Reverse penny drop succeeds with the account name, IFSC HDFC0000001 and account ending 4321. The UPI
 *   link is a test link: nothing needs paying.
 */

export const TEST_PAN_MATCH = "ABCDE1234F";
export const TEST_PAN_MISMATCH = "ABCDE0000F";
export const TEST_AADHAAR = { yearOfBirth: 1990, last4: "1234" } as const;
export const TEST_BANK = { ifsc: "HDFC0000001", last4: "4321" } as const;
const TTL_MS = 10 * 60_000;

/** A registered name that never matches the account name, whatever it is. */
function otherName(accountName: string): string {
  return ["Zara Quinlan", "Omar Pratt"].find((n) => compareNames(n, accountName).result === "mismatch") ?? "Zara Quinlan";
}

const requestId = (prefix: string) => `${prefix}_test_${crypto.randomBytes(9).toString("base64url")}`;

export const testPan: PanVerifier = {
  name: "test",
  async verify(pan, subject) {
    if (pan === TEST_PAN_MATCH) return { status: "valid", registeredName: subject.name, reference: "test", sample: true };
    if (pan === TEST_PAN_MISMATCH) return { status: "valid", registeredName: otherName(subject.name), reference: "test", sample: true };
    return { status: "not_found", registeredName: null, reference: "test", sample: true };
  },
};

export const testDigiLocker: DigiLockerClient = {
  name: "test",
  async start({ redirectUrl }) {
    const id = requestId("dl");
    const url = new URL(redirectUrl);
    url.searchParams.set("success", "True");
    url.searchParams.set("id", id);
    url.searchParams.set("scope", "ADHAR");
    return { requestId: id, url: url.toString(), expiresAt: Date.now() + TTL_MS };
  },
  async finish(id, subject) {
    return { status: "done", name: subject.name, yearOfBirth: TEST_AADHAAR.yearOfBirth, last4: TEST_AADHAAR.last4, reference: id };
  },
};

export const testBank: BankVerifier = {
  name: "test",
  async reversePennyDrop() {
    const id = requestId("rpd");
    const upiLink = `upi://pay?pa=vaultwise.test@upi&pn=Vaultwise%20Test&am=1.00&tr=${id}&tn=Vaultwise%20account%20check&cu=INR`;
    return { requestId: id, upiLink, expiresAt: Date.now() + TTL_MS };
  },
  async result(id, subject) {
    return { status: "done", holderName: subject.name, ifsc: TEST_BANK.ifsc, last4: TEST_BANK.last4, reference: id };
  },
};

export const testProviders: CheckProviders = { pan: testPan, digilocker: testDigiLocker, bank: testBank };
