import { useLocalSearchParams } from "expo-router";
import { RulesSheet } from "@/features/vaults/RulesSheet";

/** Rules sheet: `/rules/<category>`, optionally `?template=<category>` or `?vaultId=<id>`. */
export default function RulesRoute() {
  const { category, template, vaultId } = useLocalSearchParams<{ category?: string; template?: string; vaultId?: string }>();
  return <RulesSheet category={category} template={template} vaultId={vaultId} />;
}
