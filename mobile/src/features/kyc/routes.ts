import { router, type Href } from "expo-router";

/** identity: Verify your ID. Cast once, so it type-checks before `expo start` regenerates routes. */
export const VERIFY_ID_HREF = "/verify-id" as Href;

/** Closes Verify your ID: back to where it opened from, or Settings when it was opened by a link. */
export const closeVerifyId = () => (router.canGoBack() ? router.back() : router.replace("/settings"));
