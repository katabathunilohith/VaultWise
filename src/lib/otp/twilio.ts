import { OtpError } from "./errors";
import type { OtpSender } from "./senders";

/**
 * SMS through Twilio's Messages API.
 *
 * Written from the docs, not run against Twilio:
 * https://www.twilio.com/docs/messaging/api/message-resource#create-a-message-resource
 * (POST /2010-04-01/Accounts/{AccountSid}/Messages.json, HTTP Basic auth with the Account SID and Auth
 * Token, form fields To, Body and From or MessagingServiceSid; 201 with the message's `sid` on success,
 * a JSON `{ code, message }` on failure). Unit-tested with fetch mocked; try it with a Twilio trial
 * account before relying on it. Sending OTP SMS to Indian numbers in production also needs DLT
 * registration of the sender and template.
 */

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** A phone number in E.164 form, or a Messaging Service SID ("MG…"). */
  from: string;
}

export const TWILIO_API = "https://api.twilio.com/2010-04-01";
const TIMEOUT_MS = 10_000;

/** TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM, or null when any is missing. */
export function twilioConfig(env: Readonly<Record<string, string | undefined>> = process.env): TwilioConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const from = env.TWILIO_FROM?.trim();
  return accountSid && authToken && from ? { accountSid, authToken, from } : null;
}

export function twilioSender(cfg: TwilioConfig): OtpSender {
  return {
    name: "twilio",
    async send({ phone, text }) {
      const form = new URLSearchParams({ To: phone, Body: text });
      if (/^MG[0-9a-f]{32}$/i.test(cfg.from)) form.set("MessagingServiceSid", cfg.from);
      else form.set("From", cfg.from);
      let res: Response;
      try {
        res = await fetch(`${TWILIO_API}/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`, {
          method: "POST",
          headers: {
            authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64")}`,
            "content-type": "application/x-www-form-urlencoded",
            accept: "application/json",
          },
          body: form.toString(),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (e) {
        console.error(`[otp] Twilio request failed: ${(e as Error)?.message ?? e}`);
        throw new OtpError(502, "We couldn't send the code. Try again in a minute.", "otp_send_failed");
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { code?: number; message?: string } | null;
        console.error(`[otp] Twilio refused the message (${res.status}): ${err?.code ?? ""} ${err?.message ?? ""}`.trim());
        throw new OtpError(502, "We couldn't send the code. Check the number and try again in a minute.", "otp_send_failed");
      }
      return {};
    },
  };
}
