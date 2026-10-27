import { audit } from "../audit";
import { maskEmail } from "../kyc/ids";

/**
 * Account notices for recovery. There is no email provider in this project, so a notice is written to
 * the server log (with the address masked) and to the audit log, where the ops console shows it.
 *
 * To send real email, implement `deliver` below with your provider (Resend, SES, SendGrid, Postmark...)
 * and set its key in the environment. Keep the audit entry: it is the record that the notice went out.
 */

export type NoticeKind = "recovery_started" | "recovery_approved" | "recovery_rejected" | "recovery_cancelled" | "account_closed";

const SUBJECTS: Record<NoticeKind, string> = {
  recovery_started: "Someone asked to recover your Vaultwise account",
  recovery_approved: "Your Vaultwise account was moved to a new sign-in",
  recovery_rejected: "A request to recover your Vaultwise account was turned down",
  recovery_cancelled: "A request to recover your Vaultwise account was cancelled",
  account_closed: "Your Vaultwise account is closed",
};

const BODIES: Record<NoticeKind, string> = {
  recovery_started:
    "Someone signed in with a new account and showed an ID that matches yours. A person will check it before anything changes. If this wasn't you, reply to this email or contact support. Money can't move while we check.",
  recovery_approved: "A person checked the ID and moved your account to the new sign-in. Your old sign-in no longer works. If this wasn't you, contact support now.",
  recovery_rejected: "A person checked the request and turned it down. Nothing changed on your account.",
  recovery_cancelled: "The request was cancelled. Nothing changed on your account.",
  account_closed: "Your account is closed. Your records are kept as the law requires.",
};

export interface Notice {
  to: string;
  subject: string;
  body: string;
}

/** Replace with a real provider call. Must not throw for a bad address; log and move on. */
async function deliver(notice: Notice): Promise<"sent" | "logged"> {
  console.info(`[notify] to ${maskEmail(notice.to)}: ${notice.subject}`);
  return "logged";
}

export async function notifyAccount(n: { userId: string; email: string | null; kind: NoticeKind; ref?: string }) {
  const channel = n.email ? await deliver({ to: n.email, subject: SUBJECTS[n.kind], body: BODIES[n.kind] }).catch(() => "failed" as const) : "no_email";
  audit({
    userId: n.userId,
    actor: "notifications",
    actorType: "system",
    action: `notice.${n.kind}`,
    entityType: n.ref ? "recovery_claim" : "user",
    entityId: n.ref ?? n.userId,
    details: { to: maskEmail(n.email), channel },
  });
  return channel;
}
