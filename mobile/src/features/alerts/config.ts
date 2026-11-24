/**
 * alerts (plan 06): the switch for the alerts inbox, the bell on Home and push registration. Off,
 * Home has no bell, Settings has no Alerts row and the phone never asks for push permission; the
 * server still records alerts.
 */
export const ALERTS_ENABLED = true;

/** Ask the server for new alerts this often while the app is open (React Query pauses it in the background). */
export const ALERTS_POLL_MS = 60_000;

/** The inbox (app/settings/alerts.tsx). */
export const ALERTS_ROUTE = "/settings/alerts";
