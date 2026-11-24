import { newId } from "../db";
import { alertSenders, inAppSender, type AlertSender } from "./senders";
import { alertExists, type Alert, type AlertKind } from "./store";

/**
 * Raises an alert for a person: written to the in-app inbox now (inside the caller's transaction, if
 * any) and pushed to their phones once the caller's work has finished. Never throws: an alert must
 * not stop a money move. Returns the alert, or null when it couldn't be recorded.
 */
export function raiseAlert(userId: string, kind: AlertKind, title: string, body: string, now = Date.now()): Alert | null {
  const alert: Alert = { id: newId("alt"), userId, kind, title: title.slice(0, 120), body: body.slice(0, 500), createdAt: now, readAt: null };
  try {
    const senders = alertSenders();
    const later: AlertSender[] = [];
    for (const s of senders) {
      if (s.accepts && !s.accepts(alert)) continue;
      if (s.when === "now") void s.send(alert);
      else later.push(s);
    }
    if (later.length) setImmediate(() => deliverLater(alert, later, senders.includes(inAppSender)));
    return alert;
  } catch (e) {
    console.error(`[alerts] couldn't raise a ${kind} alert: ${(e as Error)?.message ?? e}`);
    return null;
  }
}

/** Runs the "later" senders, unless the alert's row was rolled back with the work it was about. */
function deliverLater(alert: Alert, senders: AlertSender[], recordedInApp: boolean) {
  try {
    if (recordedInApp && !alertExists(alert.id)) return;
  } catch {
    return;
  }
  for (const s of senders)
    Promise.resolve()
      .then(() => s.send(alert))
      .catch((e) => console.warn(`[alerts] ${s.name} failed for alert ${alert.id}: ${(e as Error)?.message ?? e}`));
}
