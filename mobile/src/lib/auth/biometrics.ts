import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";
import { withSystemUi } from "./app-lock";

/** Which biometric the device offers, if any (none on web, and in Expo Go Face ID needs a dev build). */
export async function biometricKind(): Promise<"face" | "finger" | null> {
  if (Platform.OS === "web") return null;
  try {
    const [has, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
    if (!has || !enrolled) return null;
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "face";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "finger";
    return null;
  } catch {
    return null;
  }
}

export async function authenticateBiometric(reason: string) {
  try {
    const r = await withSystemUi(() =>
      LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: "Use PIN", disableDeviceFallback: true }),
    );
    return r.success;
  } catch {
    return false;
  }
}
