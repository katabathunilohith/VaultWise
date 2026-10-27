import type { KycProvider } from "../types";

/**
 * Slot for an official KYC provider (DigiLocker through a licensed partner such as Setu or Digio,
 * or HyperVerge / IDfy / Signzy). Not implemented: it needs a contract and credentials.
 * README.md in this folder lists exactly what to build here; keep the KycProvider shape so
 * nothing else changes.
 */
export const externalProvider: KycProvider = {
  name: "external",
  async verify() {
    throw new Error("No official KYC provider is configured. See src/lib/kyc/README.md.");
  },
};
