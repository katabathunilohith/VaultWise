/**
 * alerts in Practice (plan 06), mirroring GET /alerts, POST /alerts/read and POST /push/register.
 *
 * The simulator's money moves call `practiceAlert()` (lines marked `// alerts` in vaults.ts,
 * wallet.ts and emergency.ts), and devices.ts adds the device, phone and MPIN-reset ones, so the
 * inbox and the bell on Home fill up the way they would live. Nothing is pushed: Practice sends
 * nothing off the phone. The inbox is a Practice slice, so it survives a reload; Start over and
 * Delete account empty it.
 *
 * protection (baseline N5): the inbox is in the bulk save (plain AsyncStorage), so an alert's words
 * never carry a personal detail: no phone number (masked or not) and no payee name someone typed.
 * The callers say "your verified number" and "the payee" instead, and an older save's alerts are
 * reworded the same way as they load (`generaliseAlert`), so the next save drops those details.
 */
import type { AlertItem, AlertKind, AlertsList } from "../security-types";
import { registerPracticeSlice } from "./persist";
import { clone, DAY, newId, wait } from "./state";

/** The server keeps at most this many in one answer (its `limit` maximum). */
const MAX = 200;

interface AlertsState {
  alerts: AlertItem[];
}

/** One read alert to start with, so the inbox shows what it's for. */
const fresh = (now = Date.now()): AlertsState => ({
  alerts: [
    {
      id: newId("alr"),
      kind: "device_trusted",
      title: "This phone is trusted",
      body: "It's the first phone on your account, so it can move any amount. A new phone has to prove itself first.",
      createdAt: now - 3 * DAY,
      readAt: now - 3 * DAY,
    },
  ],
});

const A: AlertsState = fresh();

const isAlert = (a: unknown): a is AlertItem => {
  const x = a as AlertItem | null;
  return !!x && typeof x.id === "string" && typeof x.title === "string" && typeof x.createdAt === "number";
};

/**
 * protection: older builds put the masked number and the typed payee in some alerts' words. Those
 * are reworded without them (the wording the callers use now). Pure.
 */
export function generaliseAlert(a: AlertItem): AlertItem {
  const body = a.body
    .replace(/^Codes for new phones and MPIN resets now go to .+\.$/, "Codes for new phones and MPIN resets now go to your verified number.")
    .replace(/^Your MPIN was reset with a code sent to .+?\. If this wasn't you/, "Your MPIN was reset with a code sent to your verified number. If this wasn't you")
    .replace(/^(.+? from .+?) to .+\. It's paid once the bill is checked\.$/, "$1. It's paid to the payee once the bill is checked.")
    .replace(/^You paid (.+?) to .+ from your wallet\.$/, "You paid $1 from your wallet.");
  return body === a.body ? a : { ...a, body };
}

registerPracticeSlice<AlertsState>({
  key: "alerts",
  save: () => ({ alerts: A.alerts }),
  load: (saved) => {
    if (!Array.isArray(saved?.alerts)) throw new Error("Not a Practice inbox");
    A.alerts = saved.alerts.filter(isAlert).slice(0, MAX).map(generaliseAlert); // protection
  },
  reset: () => Object.assign(A, fresh()),
});

const unread = () => A.alerts.filter((a) => a.readAt === null).length;

/** Adds an alert, newest first (the server's in-app sender). */
export function practiceAlert(kind: AlertKind, title: string, body: string) {
  A.alerts = [{ id: newId("alr"), kind, title, body, createdAt: Date.now(), readAt: null }, ...A.alerts].slice(0, MAX);
}

export const alertsDemo = {
  alerts: async (): Promise<AlertsList> => {
    await wait(150);
    return { alerts: clone(A.alerts), unread: unread() };
  },
  markAlertsRead: async (ids?: string[]): Promise<{ ok: true; unread: number | null }> => {
    await wait(150);
    const now = Date.now();
    const wanted = ids ? new Set(ids) : null;
    for (const a of A.alerts) if (a.readAt === null && (!wanted || wanted.has(a.id))) a.readAt = now;
    return { ok: true, unread: unread() };
  },
  // Practice never asks for push permission and never pushes.
  registerPush: async (_token: string) => ({ ok: true as const }),
  unregisterPush: async (_token: string, _deviceId?: string) => ({ ok: true as const }),
};
