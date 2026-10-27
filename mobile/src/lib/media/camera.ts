import { useCallback, useEffect, useEffectEvent } from "react";
import { AppState, Platform } from "react-native";
import { useCameraPermissions, type PermissionResponse } from "expo-camera";
import { openAppSettings, withSystemUi } from "@/lib/auth/app-lock";

/** What the system says about the camera permission. */
export type CameraAnswer =
  | "granted"
  /** Not asked yet, or the system can ask again. */
  | "needs-permission"
  /** Denied for good: only Settings can turn it back on. */
  | "blocked";

export type CameraStatus =
  /** Web: the in-app camera is a phone feature. */
  | "unsupported"
  /** The permission hasn't been read yet. */
  | "checking"
  | CameraAnswer;

function answerOf(p: PermissionResponse): CameraAnswer {
  if (p.granted) return "granted";
  return p.canAskAgain ? "needs-permission" : "blocked";
}

/**
 * Camera access for the in-app camera (expo-camera). The permission prompt and Settings are system
 * UI, so the app lock waits for them (withSystemUi, openAppSettings).
 *
 * With `recheckOnReturn`, coming back to the app (from Settings, say) while access isn't granted
 * reads the permission again, since the system hook only reads it on mount; `onRecheck` gets the
 * answer (null when it couldn't be read).
 */
export function useCameraAccess({
  recheckOnReturn = false,
  onRecheck,
}: { recheckOnReturn?: boolean; onRecheck?: (answer: CameraAnswer | null) => void } = {}) {
  const [permission, requestPermission, getPermission] = useCameraPermissions({ get: Platform.OS !== "web" });

  const status: CameraStatus = Platform.OS === "web" ? "unsupported" : !permission ? "checking" : answerOf(permission);

  /** Shows the system prompt. Null when it couldn't be shown. */
  const request = useCallback(
    (): Promise<CameraAnswer | null> =>
      withSystemUi(requestPermission)
        .then(answerOf)
        .catch(() => null),
    [requestPermission],
  );

  /** Reads the permission again. Null when it couldn't be read. */
  const recheck = useCallback(
    (): Promise<CameraAnswer | null> =>
      getPermission()
        .then(answerOf)
        .catch(() => null),
    [getPermission],
  );

  const openSettings = useCallback(() => void openAppSettings(), []);

  const granted = status === "granted";
  const rechecked = useEffectEvent((answer: CameraAnswer | null) => onRecheck?.(answer));
  useEffect(() => {
    if (!recheckOnReturn || Platform.OS === "web" || granted) return;
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void recheck().then((answer) => rechecked(answer));
    });
    return () => sub.remove();
  }, [recheckOnReturn, granted, recheck]);

  return { status, request, recheck, openSettings };
}

export type CameraAccess = ReturnType<typeof useCameraAccess>;
