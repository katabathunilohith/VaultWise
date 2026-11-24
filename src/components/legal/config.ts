/**
 * legal: the details the public pages (/privacy, /terms, /delete-account) share.
 *
 * BEFORE GOING LIVE, replace CONTACT_EMAIL with a real inbox the team reads (for example privacy@ on the
 * domain from deploy/README.md), and update LAST_UPDATED whenever the policy text changes.
 */
export const CONTACT_EMAIL = "privacy@<your-domain>";

export const LAST_UPDATED = "22 November 2026";

/** Who runs Vaultwise, as the pages name it. */
export const OPERATOR = "the Vaultwise student team";

/** Days we keep a closed account's records before deleting them, and how long backups take to roll off. */
export const CLOSED_ACCOUNT_DAYS = 90;
export const BACKUP_DAYS = 14;
/** How fast we answer a privacy request or complaint. */
export const REPLY_DAYS = 30;

/** Pages anyone can open without signing in. */
export const PUBLIC_PAGES = ["/privacy", "/terms", "/delete-account"];

export function isPublicPage(path: string | null | undefined): boolean {
  return !!path && PUBLIC_PAGES.some((p) => path === p || path.startsWith(`${p}/`));
}
