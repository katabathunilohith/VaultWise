"use client";

import { ApiError } from "@/lib/client";
import { Field, Input } from "./ui";

/**
 * mpin: the MPIN box the web's money screens show before a money move, and the account changes that
 * always need the MPIN (adding or changing the phone number, trusting or signing out a device; see
 * src/components/devices-alerts.tsx). New MPINs are 6 digits; an account opened before MPINs can still
 * type its old 4-digit PIN until it changes it.
 */
export function MpinField({
  value,
  onChange,
  label = "Your MPIN",
  hint = "Every money move needs your MPIN.",
  autoFocus,
}: {
  value: string;
  onChange: (pin: string) => void;
  label?: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="password"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        maxLength={6}
        className="max-w-[180px]"
        autoComplete="off"
        autoFocus={autoFocus}
      />
    </Field>
  );
}

/** True when the box holds something worth sending: 6 digits, or an older 4- or 5-digit PIN. */
export const mpinReady = (pin: string) => /^\d{4,6}$/.test(pin);

/**
 * The message to show for a failed money move. The server's MPIN messages already say how many
 * tries are left or when the lock ends. `clearPin` is called when the PIN should be typed again.
 */
export function moneyErrorText(e: unknown, clearPin?: () => void): string {
  if (e instanceof ApiError && (e.code === "mpin_wrong" || e.code === "mpin_locked")) clearPin?.();
  return (e as Error)?.message ?? "Something went wrong. Try again.";
}
