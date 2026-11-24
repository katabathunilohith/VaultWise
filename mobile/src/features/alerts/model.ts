import {
  ArrowUpRightIcon,
  DeviceMobileIcon,
  LockKeyIcon,
  PasswordIcon,
  PhoneIcon,
  ShieldCheckIcon,
  SignOutIcon,
  SlidersIcon,
  type Icon,
} from "@/components/icons";

/** Alerts as the screens show them, pure. The icon per kind; look up with `?? BellIcon` for kinds this app doesn't know yet. */
export const ALERT_ICONS: Partial<Record<string, Icon>> = {
  new_device: DeviceMobileIcon,
  device_trusted: ShieldCheckIcon,
  device_revoked: SignOutIcon,
  money_out: ArrowUpRightIcon,
  limit_loosened: SlidersIcon,
  mpin_locked: LockKeyIcon,
  mpin_changed: PasswordIcon,
  phone_verified: PhoneIcon,
};

/** The bell's badge: "1" to "9", then "9+". */
export function badgeText(unread: number) {
  return unread > 9 ? "9+" : String(unread);
}

/** "Alerts, 3 unread" for screen readers. */
export function bellLabel(unread: number) {
  return unread > 0 ? `Alerts, ${unread} unread` : "Alerts";
}
