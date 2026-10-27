import { Redirect, useLocalSearchParams } from "expo-router";
import { WALLET_ENABLED, WalletFlow } from "@/features/wallet";

/**
 * wallet: one wallet flow (full-screen modal): `/wallet/add`, `/wallet/move` (optionally
 * `?vaultId=`), `/wallet/spend`, `/wallet/cash-out` or `/wallet/limit`.
 */
export default function WalletActionRoute() {
  const { action, vaultId } = useLocalSearchParams<{ action: string; vaultId?: string }>();
  const a = Array.isArray(action) ? action[0] : action;
  const v = Array.isArray(vaultId) ? vaultId[0] : vaultId;
  if (!WALLET_ENABLED) return <Redirect href="/" />;
  return <WalletFlow key={a} action={a} vaultId={v || undefined} />;
}
