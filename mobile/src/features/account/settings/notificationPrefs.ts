import { useSyncExternalStore } from "react";
import { getItem, removeItem, setItem } from "@/lib/storage";

/**
 * Notification choices, kept on this phone. Money moves and security alerts are always on and
 * aren't stored. Tips & offers start off (no marketing without asking).
 */
export type QuietWindow = "21-6" | "22-7" | "23-8";

export interface NotificationPrefs {
  reminders: boolean;
  tips: boolean;
  quiet: boolean;
  quietWindow: QuietWindow;
}

export const QUIET_WINDOWS: { value: QuietWindow; label: string }[] = [
  { value: "21-6", label: "9 pm – 6 am" },
  { value: "22-7", label: "10 pm – 7 am" },
  { value: "23-8", label: "11 pm – 8 am" },
];

const KEY = "vw.notifications";
const DEFAULTS: NotificationPrefs = { reminders: true, tips: false, quiet: false, quietWindow: "22-7" };

let prefs: NotificationPrefs = DEFAULTS;
let started = false;
/** Set once the customer changes something, so a slow first read can't overwrite it. */
let touched = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function load() {
  if (started) return;
  started = true;
  void getItem(KEY).then((raw) => {
    if (!raw || touched) return;
    try {
      const saved = JSON.parse(raw) as Partial<NotificationPrefs>;
      const window = QUIET_WINDOWS.some((w) => w.value === saved.quietWindow) ? (saved.quietWindow as QuietWindow) : DEFAULTS.quietWindow;
      prefs = {
        reminders: saved.reminders ?? DEFAULTS.reminders,
        tips: saved.tips ?? DEFAULTS.tips,
        quiet: saved.quiet ?? DEFAULTS.quiet,
        quietWindow: window,
      };
      emit();
    } catch {
      // keep the defaults
    }
  });
}

function subscribe(fn: () => void) {
  load();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useNotificationPrefs() {
  return useSyncExternalStore(
    subscribe,
    () => prefs,
    () => prefs,
  );
}

export function setNotificationPrefs(patch: Partial<NotificationPrefs>) {
  touched = true;
  prefs = { ...prefs, ...patch };
  emit();
  void setItem(KEY, JSON.stringify(prefs));
}

/** Back to defaults (account deleted). */
export async function resetNotificationPrefs() {
  prefs = DEFAULTS;
  emit();
  await removeItem(KEY);
}

export function notificationSummary(p: NotificationPrefs) {
  const parts = [p.reminders ? "Reminders on" : "Reminders off"];
  if (p.quiet) parts.push(`quiet ${QUIET_WINDOWS.find((w) => w.value === p.quietWindow)?.label ?? ""}`.trim());
  return parts.join(" · ");
}
