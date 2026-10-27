import { PRACTICE_ONLY } from "@/lib/build";

/**
 * The one switch for "Verify your ID" on the phone (identity). Off, Home has no ID to-do and
 * Settings has no Identity verification row. The server still decides whether money can move
 * (KYC_ENFORCED there), and its "Verify your ID to move money" answer still shows where it happens.
 * Always off in the Practice-only store build (lib/build.ts).
 */
export const KYC_ENABLED = !PRACTICE_ONLY;
