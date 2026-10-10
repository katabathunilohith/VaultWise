import { VaultsListScreen } from "@/features/vaults/VaultsListScreen";
import { useRefreshOnFocus } from "@/lib/api/hooks";

/** Vaults tab root. */
export default function VaultsRoute() {
  useRefreshOnFocus();
  return <VaultsListScreen />;
}
