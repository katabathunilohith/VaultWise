import { AppState, Platform } from "react-native";
import { POSTHOG_HOST, POSTHOG_KEY, TESTER_ENABLED } from "./config";
import { getTester } from "./state";

/**
 * Sends test activity to PostHog, only after the person says yes. Events carry a random ID, the
 * platform and the step's name; never a name, an amount or anything typed. A failed send is dropped
 * quietly: a test must never get in the way of the app.
 */

type Properties = Record<string, string | number | boolean>;

const SEND_AFTER_MS = 3000;
const queue: object[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function eventFor(name: string, properties: Properties) {
  return {
    event: name,
    distinct_id: getTester().id,
    timestamp: new Date().toISOString(),
    // No person profile and no location lookup: a test needs counts, not people.
    properties: { ...properties, platform: Platform.OS, $process_person_profile: false, $geoip_disable: true },
  };
}

async function post(batch: object[]) {
  if (!POSTHOG_KEY || !batch.length) return false;
  try {
    const res = await fetch(`${POSTHOG_HOST}/batch/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: POSTHOG_KEY, batch }),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  void post(queue.splice(0));
}

export function track(name: string, properties: Properties = {}) {
  if (!TESTER_ENABLED || getTester().sharing !== true) return;
  queue.push(eventFor(name, properties));
  timer ??= setTimeout(flush, SEND_AFTER_MS);
}

/** The feedback form is sent on purpose, so it goes even if activity sharing is off. True once delivered. */
export function sendFeedback(properties: Properties) {
  return post([eventFor("feedback_sent", properties)]);
}

/** Sends what's waiting when the app or tab goes to the background. Returns the clean-up. */
export function flushInBackground() {
  const sub = AppState.addEventListener("change", (s) => {
    if (s !== "active") flush();
  });
  return () => sub.remove();
}
