import { EmergencyHome } from "@/features/emergency/home/EmergencyHome";
import { useRefreshOnFocus } from "@/lib/api/hooks";

/** Emergency tab root. The screen lives in src/features/emergency. */
export default function EmergencyTab() {
  useRefreshOnFocus();
  return <EmergencyHome />;
}
