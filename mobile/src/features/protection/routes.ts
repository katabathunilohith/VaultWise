import { SENSITIVE_ROUTES } from "./config";

/** The route path without groups: ["(tabs)", "emergency"] → "emergency", ["wallet", "[action]"] → "wallet/[action]". */
export function routePath(segments: readonly string[]) {
  return segments.filter((s) => !(s.startsWith("(") && s.endsWith(")"))).join("/");
}

/** Whether the route is one where screenshots and recordings are blocked (SENSITIVE_ROUTES). Pure. */
export function isSensitiveRoute(segments: readonly string[], routes: readonly string[] = SENSITIVE_ROUTES) {
  const path = routePath(segments);
  return routes.some((r) => path === r || path.startsWith(`${r}/`));
}
