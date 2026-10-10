import { HomeScreen } from "@/features/home/HomeScreen";
import { useRefreshOnFocus } from "@/lib/api/hooks";

/** Home tab root. The screen lives in src/features/home. */
export default function Home() {
  useRefreshOnFocus();
  return <HomeScreen />;
}
