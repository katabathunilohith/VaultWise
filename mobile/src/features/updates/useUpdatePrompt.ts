import { useEffect, useState } from "react";
import { AppState } from "react-native";
import * as Updates from "expo-updates";
import { CHECK_EVERY_MS } from "./config";

// expo-updates checks once at launch by itself (`checkAutomatically` defaults to ON_LOAD), so the clock starts now.
let lastCheck = Date.now();

async function checkAndFetch() {
  lastCheck = Date.now();
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) await Updates.fetchUpdateAsync();
  } catch {
    // Offline, rate-limited or the server is down: try again on a later return to the app.
  }
}

export interface UpdatePrompt {
  /** An update has downloaded and is waiting for a restart. */
  ready: boolean;
  restarting: boolean;
  /** The last Restart didn't work; the update still applies on the next cold start. */
  failed: boolean;
  restart: () => void;
}

/**
 * Whether a downloaded update is waiting, and a restart that applies it. While nothing is waiting, it
 * also checks for (and downloads) an update each time the app comes back to the foreground, at most
 * every 30 minutes. Only call it where `UPDATES_ACTIVE` is true: the Updates API rejects everywhere else.
 */
export function useUpdatePrompt(): UpdatePrompt {
  const { isUpdatePending, isChecking, isDownloading, isRestarting } = Updates.useUpdates();
  const [restarting, setRestarting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isUpdatePending || isChecking || isDownloading) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() - lastCheck >= CHECK_EVERY_MS) void checkAndFetch();
    });
    return () => sub.remove();
  }, [isUpdatePending, isChecking, isDownloading]);

  const restart = () => {
    setRestarting(true);
    setFailed(false);
    // Nothing meaningful runs after a successful reload, so only the failure is handled.
    Updates.reloadAsync().catch(() => {
      setRestarting(false);
      setFailed(true);
    });
  };

  return { ready: isUpdatePending, restarting: restarting || isRestarting, failed, restart };
}
