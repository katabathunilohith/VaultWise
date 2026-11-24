/**
 * mpin: when saving a SIP is a money action (`invest_sip`). Pure, with no imports, so the web form can show the
 * MPIN box by the same rule the server applies (the module's barrel pulls in the database, so the browser imports
 * this file directly). The server's check in POST /invest/core/sip is the one that counts.
 */
export type SipFrequency = "weekly" | "monthly";

/** What a plan debits in an average month, so weekly and monthly plans compare fairly. */
export function sipPerMonth(amount: number, frequency: SipFrequency) {
  return frequency === "weekly" ? (amount * 52) / 12 : amount;
}

/**
 * Setting a SIP up needs the MPIN, and so does a change that moves more money: a higher amount per month (a
 * monthly plan turned weekly counts) or a start date that brings the next debit forward (a past date runs the
 * missed debits at once). Lowering it, or changing it without moving more money sooner, doesn't; nor does pausing
 * it (DELETE). Amounts in the same unit on both sides; times in ms.
 */
export function sipNeedsMpin(
  current: { amount: number; frequency: SipFrequency; next_run_at: number } | null | undefined,
  next: { amount: number; frequency: SipFrequency; startAt?: number },
) {
  if (!current) return true;
  if (sipPerMonth(next.amount, next.frequency) > sipPerMonth(current.amount, current.frequency)) return true;
  return next.startAt !== undefined && next.startAt < current.next_run_at;
}
