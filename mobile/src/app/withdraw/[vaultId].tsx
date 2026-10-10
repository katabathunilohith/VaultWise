import { useLocalSearchParams } from "expo-router";
import { WithdrawFlow } from "@/features/proof/withdraw/WithdrawFlow";

/**
 * Withdraw with proof (full-screen modal).
 * - `/withdraw/choose` starts with the vault picker.
 * - `/withdraw/{vaultId}` starts at the amount.
 * - `/withdraw/{vaultId}?withdrawalId={id}` resumes a request: adds a bill to one awaiting proof
 *   (or declined), or shows the check for one already being verified.
 */
export default function WithdrawRoute() {
  const { vaultId, withdrawalId } = useLocalSearchParams<{ vaultId: string; withdrawalId?: string }>();
  return <WithdrawFlow key={`${vaultId}:${withdrawalId ?? ""}`} vaultParam={vaultId ?? "choose"} withdrawalParam={withdrawalId || undefined} />;
}
