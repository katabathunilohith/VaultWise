import { useLocalSearchParams } from "expo-router";
import { ProofDetailScreen } from "@/features/proof/detail/ProofDetailScreen";

/** The release tracker for one proof (pushed). */
export default function ProofRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProofDetailScreen key={id} id={id} />;
}
