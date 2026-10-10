import { router } from "expo-router";

/** Where the emergency area links to. From the Emergency tab (a normal stack position): push. */
export const go = {
  settings: () => router.push("/settings"),
  support: () => router.push("/support"),
  request: () => router.push("/emergency-request"),
  /** The receipt upload flow lives in the emergency-request modal (camera = full-screen modal, R7). */
  receipt: (emergencyId: string) => router.push({ pathname: "/emergency-request", params: { receipt: emergencyId } }),
  track: (id: string) => router.push({ pathname: "/track", params: { kind: "emergency", id } }),
  /** Leave a modal flow; a cold-opened deep link has nothing behind it, so land on the tab. */
  close: () => (router.canGoBack() ? router.back() : router.replace("/emergency")),
};

/**
 * From inside the full-screen modal. On iOS, react-native-screens puts a pushed card that follows
 * a modal into the root navigation stack *under* the modal, so it would never be seen. The modal
 * is swapped for the destination instead (any Tier 2 pause carries on server-side).
 */
export const leave = {
  limits: () => router.replace("/settings/limits"),
  support: () => router.replace("/support"),
  proof: (id: string) => router.replace({ pathname: "/proof/[id]", params: { id } }),
};
