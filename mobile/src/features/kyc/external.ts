import { AppState, Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { withSystemUi } from "@/lib/auth/app-lock";

/**
 * kyc-checks: leaving Vaultwise for a step. DigiLocker opens in an in-app browser; the ₹1 payment
 * opens the person's UPI app. Both count as the app's own system UI, so on Android the app lock
 * waits for them (withSystemUi, up to its 90 second hold). Never called in Practice.
 */

/**
 * Where the browser would close itself: the app's own link to this screen. The server sends DigiLocker
 * back to its web page (KYC_DIGILOCKER_REDIRECT_URL), so today the person closes the browser
 * themselves; either way the screen carries on when they're back.
 */
const returnUrl = () => Linking.createURL("verify-id");

/** "returned": back from the in-app browser. "elsewhere": opened in another tab (web). */
export type DigiLockerOutcome = "returned" | "elsewhere" | "unavailable";

/**
 * Opens the provider's DigiLocker page and resolves when the person is back (SDK 58: iOS resolves
 * with "cancel" or "success", Android with "dismiss" or "success"; any of them means "back").
 * An ephemeral session shares no cookies with the phone's browser, and iOS doesn't ask first.
 */
export async function openDigiLocker(url: string): Promise<DigiLockerOutcome> {
  if (Platform.OS === "web") {
    try {
      await Linking.openURL(url);
      return "elsewhere";
    } catch {
      return "unavailable";
    }
  }
  return withSystemUi(async () => {
    try {
      await WebBrowser.openAuthSessionAsync(url, returnUrl(), { preferEphemeralSession: true });
      return "returned" as const;
    } catch {
      return "unavailable" as const;
    }
  });
}

/** "no_app": nothing on this phone opens UPI links (or this is the web preview). */
export type UpiOutcome = "opened" | "no_app";

/**
 * Hands the upi://pay link to a UPI app and resolves when the person is back in Vaultwise. canOpenURL
 * isn't used: it needs the scheme declared in the app config (iOS LSApplicationQueriesSchemes,
 * Android package visibility), while openURL simply fails when no app can take the link.
 */
export async function openUpiLink(link: string): Promise<UpiOutcome> {
  if (Platform.OS === "web") return "no_app";
  return withSystemUi(async () => {
    const back = untilBack();
    try {
      await Linking.openURL(link);
    } catch {
      back.cancel();
      return "no_app" as const;
    }
    await back.done;
    return "opened" as const;
  });
}

/** Resolves once the app is active again after leaving it, soon if it never left, at the latest after 10 minutes. */
function untilBack(neverLeftMs = 4_000, maxMs = 10 * 60_000) {
  let finish = () => {};
  const done = new Promise<void>((resolve) => {
    let left = false;
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") left = true;
      else if (left) finish();
    });
    const quiet = setTimeout(() => {
      if (!left) finish();
    }, neverLeftMs);
    const cap = setTimeout(() => finish(), maxMs);
    finish = () => {
      sub.remove();
      clearTimeout(quiet);
      clearTimeout(cap);
      resolve();
    };
  });
  return { done, cancel: () => finish() };
}
