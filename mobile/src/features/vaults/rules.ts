import { router } from "expo-router";
import type { VaultCategory } from "@/lib/api/types";

/**
 * Opens the rules sheet: what unlocks a category, or a particular vault (which may borrow a
 * category's rules or have its own).
 */
export function openRules(target: { category: VaultCategory; template?: VaultCategory | null; vaultId?: string }) {
  router.push({
    pathname: "/rules/[category]",
    params: {
      category: target.category,
      ...(target.template ? { template: target.template } : {}),
      ...(target.vaultId ? { vaultId: target.vaultId } : {}),
    },
  });
}
