import type { Href } from "expo-router";

/** identity: recovery screens. Cast once, so they type-check before `expo start` regenerates routes. */
export const RECOVERY_HREF = {
  claim: "/recovery/claim" as Href,
  status: "/recovery/status" as Href,
};
