/**
 * Onboarding checks (KYC_FLOW=steps): PAN, Aadhaar through DigiLocker, bank account by reverse penny drop.
 * What routes and tests may import. See README.md.
 */
export { finishBank, finishDigiLocker, startBank, startDigiLocker, submitPan } from "./service";
export { stepsView } from "./view";
export { confirmBankOnApproval } from "./approval";
export { checksProviderName, flowFor, kycFlow, type ChecksProviderName, type KycFlow } from "./config";
export { checkProviders, currentProviderNames, setCheckProviders } from "./registry";
export { setuBaseUrl, isSetuSandbox } from "./providers/setu";
export { TEST_AADHAAR, TEST_BANK, TEST_PAN_MATCH, TEST_PAN_MISMATCH } from "./providers/test";
export type * from "./types";
