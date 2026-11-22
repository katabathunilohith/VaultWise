import { PRACTICE_ONLY } from "@/lib/build";

/**
 * The switch for tester mode: the Home card, the feedback form and activity sharing. It's only on in
 * the tester build (`npm run build:tester`), which is always Practice, so no real data is involved.
 * The store build and everyday development builds never show it.
 */
export const TESTER_ENABLED = PRACTICE_ONLY && process.env.EXPO_PUBLIC_TESTER === "1";

// Read by full name: Expo only inlines EXPO_PUBLIC_* variables written out in full.
export const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim() || "";
export const POSTHOG_HOST = (process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com").replace(/\/$/, "");
