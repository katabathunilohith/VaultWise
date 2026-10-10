import { useLocalSearchParams } from "expo-router";
import { VaultDetailScreen } from "@/features/vaults/VaultDetailScreen";
import { useRefreshOnFocus } from "@/lib/api/hooks";

/** Vault detail, pushed inside the Vaults tab. */
export default function VaultRoute() {
  useRefreshOnFocus();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vaultId = Array.isArray(id) ? id[0] : (id ?? "");
  return <VaultDetailScreen key={vaultId} id={vaultId} />;
}
