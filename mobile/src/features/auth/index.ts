/**
 * Sign-in (identity): Firebase email and password, the root gate's sign-in state, the signed-out
 * screens and the signed-in set-up screen. See README.md in this folder for the switch and every
 * touch point.
 */
export { SIGN_IN_ENABLED } from "./config";
export { signOutOfVaultwise, startAuth, useServerSignOut, useSignInGate, type SignInGate } from "./gate";
export { SignInPreviewRow, SignOutRow, useAuthSettings } from "./settings";
