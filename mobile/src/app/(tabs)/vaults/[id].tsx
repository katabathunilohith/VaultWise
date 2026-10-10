import { useLocalSearchParams } from "expo-router";
import { VaultDetailScreen } from "@/features/vaults/VaultDetailScreen";

/** Vault detail, pushed inside the Vaults tab. */
export default function VaultRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vaultId = Array.isArray(id) ? id[0] : (id ?? "");
  return <VaultDetailScreen key={vaultId} id={vaultId} />;
}
