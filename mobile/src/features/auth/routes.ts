import type { Href } from "expo-router";

/**
 * identity: the sign-in screens' addresses. Typed routes come from .expo/types/router.d.ts, which
 * only `expo start` regenerates, so new routes are cast here once and type-check without it.
 */
const asHref = (path: string) => path as Href;

export const AUTH_HREF = {
  welcome: asHref("/auth"),
  signIn: asHref("/auth/sign-in"),
  create: asHref("/auth/create"),
  /** Create a login to recover an old account: set-up then goes straight to the ID step. */
  createForRecovery: asHref("/auth/create?intent=recover"),
  forgot: asHref("/auth/forgot"),
  find: asHref("/auth/find"),
  recover: asHref("/auth/recover"),
};

/** Signed in with no account yet: set one up, or recover an old one. */
export const SETUP_HREF = asHref("/setup");
