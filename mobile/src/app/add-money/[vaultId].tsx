import { useLocalSearchParams } from "expo-router";
import { AddMoneyScreen } from "@/features/vaults/AddMoneyScreen";

/** Add money (full-screen modal). `/add-money/choose` starts with a vault picker. */
export default function AddMoneyRoute() {
  const { vaultId } = useLocalSearchParams<{ vaultId: string }>();
  const id = Array.isArray(vaultId) ? vaultId[0] : (vaultId ?? "choose");
  return <AddMoneyScreen key={id} vaultId={id} />;
}
