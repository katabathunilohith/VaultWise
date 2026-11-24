import { useSegments } from "expo-router";
import { useSensitiveScreen } from "@/lib/screen-capture";
import { PROTECTION } from "./config";
import { isSensitiveRoute } from "./routes";

/**
 * Blocks screenshots and screen recordings while the current route is in SENSITIVE_ROUTES
 * (money-out flows, the MPIN sheet, the ID check, Settings → Security), through the plan 02
 * adapter (lib/screen-capture.ts), so no flow has to call it itself. On Android this also blanks
 * the app's preview in the app switcher (FLAG_SECURE). Mount once, inside the root navigator's tree.
 */
export function SensitiveRouteGuard() {
  const segments = useSegments() as readonly string[];
  useSensitiveScreen(PROTECTION.screenshotBlocking && isSensitiveRoute(segments));
  return null;
}
