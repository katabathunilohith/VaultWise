import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { useCameraPermissions } from "expo-camera";
import { router, useFocusEffect } from "expo-router";
import { haptic } from "@/lib/haptics";
import { openAppSettings, withSystemUi } from "@/lib/session";
import { parseIntentId } from "../intent-link";

export type ScanStatus =
  /** Web preview: scanning is a phone feature. */
  | "unsupported"
  /** Reading the current permission. */
  | "checking"
  /** Not asked yet (or can ask again): show the inline primer. */
  | "needs-permission"
  /** Denied for good: only Settings can turn it back on. */
  | "blocked"
  | "running"
  /** The camera couldn't start (no camera, simulator, in use elsewhere). */
  | "failed";

/** Ignore the same code for this long, so one QR doesn't open two checkouts. */
const REPEAT_MS = 2500;
const NOTICE_MS = 2500;

/**
 * Scanner state for the Pay tab. The camera runs only while the tab is focused (one camera
 * preview at a time; it stops when a checkout opens on top), and the torch resets on blur.
 */
export function usePayScanner() {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [torch, setTorch] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const handling = useRef(false);
  const last = useRef<{ data: string; at: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      handling.current = false;
      last.current = null;
      setFocused(true);
      return () => {
        setFocused(false);
        setTorch(false);
      };
    }, []),
  );

  // Coming back from Settings (or another app) may have changed the camera permission; the
  // permission hook only reads it on mount, so read it again when the app is active again.
  const granted = !!permission?.granted;
  useEffect(() => {
    if (Platform.OS === "web" || granted) return;
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void getPermission().catch(() => {});
    });
    return () => sub.remove();
  }, [granted, getPermission]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const status: ScanStatus =
    Platform.OS === "web"
      ? "unsupported"
      : cameraError
        ? "failed"
        : !permission
          ? "checking"
          : permission.granted
            ? "running"
            : permission.canAskAgain
              ? "needs-permission"
              : "blocked";

  const onCode = (data: string) => {
    if (handling.current) return;
    const now = Date.now();
    if (last.current && last.current.data === data && now - last.current.at < REPEAT_MS) return;
    last.current = { data, at: now };
    const id = parseIntentId(data);
    if (!id) {
      setNotice("That code isn't a Vaultwise payment");
      return;
    }
    handling.current = true;
    haptic("select.tick");
    router.push(`/checkout/${id}`);
  };

  return {
    status,
    /** True while the viewfinder should be mounted. */
    cameraActive: status === "running" && focused,
    torch,
    setTorch,
    notice,
    onCode,
    onMountError: (message: string) => {
      setTorch(false);
      setCameraError(message || "The camera couldn't start.");
    },
    retryCamera: () => setCameraError(null),
    // The permission prompt and Settings are system UI: the app lock waits for them.
    requestPermission: () => void withSystemUi(requestPermission).catch(() => {}),
    openSettings: () => void openAppSettings(),
  };
}

export type PayScanner = ReturnType<typeof usePayScanner>;
