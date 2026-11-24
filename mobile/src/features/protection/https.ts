import { PROTECTION } from "./config";

/**
 * protection (baseline, no certificate pinning): a server address the Data source screen may use.
 * Live builds need https://, so money and sign-in tokens never travel in the clear; development
 * builds (__DEV__) also take http:// for a server on the same network. Pure apart from __DEV__.
 */
export function allowedServerAddress(url: string, dev: boolean = __DEV__): { ok: true } | { ok: false; message: string } {
  const httpOk = dev || !PROTECTION.httpsOnly;
  if (!/^https?:\/\/[^\s/]+/i.test(url)) return { ok: false, message: httpOk ? "Start the address with http:// or https://" : "Start the address with https://" };
  if (!httpOk && !/^https:\/\//i.test(url)) return { ok: false, message: "Use an https:// address. Vaultwise only talks to a server over a secure connection." };
  return { ok: true };
}
