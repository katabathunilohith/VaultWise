import { useLocalSearchParams } from "expo-router";
import { SupportScreen } from "@/features/assistant/support/SupportScreen";
import { parseRef, parseTopic } from "@/features/assistant/support/topics";

/** Talk to a person (pushed). Optional params: ?topic=proof&ref=<id> pre-fill the case. */
export default function SupportRoute() {
  const { topic, ref } = useLocalSearchParams<{ topic?: string; ref?: string }>();
  return <SupportScreen topic={parseTopic(topic)} reference={parseRef(ref)} />;
}
