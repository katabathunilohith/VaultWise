import { PRACTICE_ONLY } from "@/lib/build";

/**
 * The one switch for account recovery on the phone (identity): Find my account, Recover with an ID
 * and "I had an account before". Off, those entry points are hidden. If the server says a recovery
 * is already waiting for a person, the app still shows it (read-only banner and status), since
 * that is the true state of the account.
 * Always off in the Practice-only store build (lib/build.ts).
 */
export const RECOVERY_ENABLED = !PRACTICE_ONLY;
