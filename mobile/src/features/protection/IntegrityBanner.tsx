import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Banner } from "@/components/ui";
import { usePracticeMode } from "@/lib/api/practice";
import { checkDeviceIntegrity } from "@/lib/device-integrity";
import { PROTECTION } from "./config";

/** "Got it" hides the warning until the app is opened again. */
let dismissed = false;

/**
 * A warning on Home when the phone looks rooted (Android) or jailbroken (iOS), from the plan 02
 * adapter (lib/device-integrity.ts). It only warns, in Practice and live alike; whether live
 * builds block money moves on such phones is for plan 08. The web can't tell, so it never shows.
 */
export function IntegrityBanner() {
  const practice = usePracticeMode();
  const [rooted, setRooted] = useState(false);
  const [hidden, setHidden] = useState(dismissed);
  useEffect(() => {
    if (!PROTECTION.integrityWarning) return;
    let alive = true;
    void checkDeviceIntegrity().then((r) => alive && setRooted(r.rooted === true));
    return () => {
      alive = false;
    };
  }, []);
  if (!PROTECTION.integrityWarning || !rooted || hidden) return null;
  const ios = Platform.OS === "ios";
  return (
    <Banner
      tone="warning"
      title={ios ? "This iPhone may be jailbroken" : "This phone may be rooted"}
      body={
        practice
          ? "Other apps could read what Vaultwise shows. Practice money is pretend, so you can carry on."
          : "Other apps could read what Vaultwise shows. Take care moving money on this phone."
      }
      action={{
        label: "Got it",
        onPress: () => {
          dismissed = true;
          setHidden(true);
        },
      }}
    />
  );
}
