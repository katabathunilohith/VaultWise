import { useLocalSearchParams } from "expo-router";
import { TrackSheet } from "@/features/proof/track/TrackSheet";

/** Tracker form sheet: `/track?kind=proof&id={proofId}` or `/track?kind=emergency&id={emergencyId}`. */
export default function TrackRoute() {
  const { kind, id } = useLocalSearchParams<{ kind?: string; id?: string }>();
  return <TrackSheet kind={kind} id={id} />;
}
