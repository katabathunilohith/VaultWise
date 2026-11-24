import { useState } from "react";
import { Linking, Platform } from "react-native";
import { router, type Href } from "expo-router";
import {
  ArrowsClockwiseIcon,
  EyeIcon,
  ExportIcon,
  FileTextIcon,
  FingerprintIcon,
  GlobeIcon,
  HeadsetIcon,
  InfoIcon,
  LockKeyIcon,
  PaletteIcon,
  PasswordIcon,
  ScanSmileyIcon,
  ShieldCheckIcon,
  SlidersIcon,
  TrashIcon,
  VibrateIcon,
  BellIcon,
  DeviceMobileIcon, // devices
  PhoneIcon, // devices
} from "@/components/icons";
import { Banner, ListRow, StatusPill, ToggleRow } from "@/components/ui";
import { api } from "@/lib/api/client";
import { useConnection, useLimits, useMe } from "@/lib/api/hooks";
import { usePracticeMode } from "@/lib/api/practice";
import { PRACTICE_ONLY } from "@/lib/build";
import { useHapticLevel } from "@/lib/haptics";
import { moneyWhole } from "@/lib/money";
import { setLockEnabled } from "@/lib/auth/app-lock";
import { useSession } from "@/lib/auth/session-state";
import { appearanceSettingAvailable, useTheme } from "@/theme";
import { Group } from "../controls";
import { Page } from "../layout";
import { biometricName, useBiometricKind, type Biometric } from "../pin-guard";
import { phoneTrust, RESET_MPIN_ROUTE, turnOffMpinShortcut, useMpinShortcut } from "@/features/mpin"; // mpin; devices: RESET_MPIN_ROUTE, phoneTrust
import { appearanceLabel } from "./AppearanceScreen";
import { connectionLabel } from "./ConnectionScreen";
import { hapticLevelLabel } from "./hapticCatalog";
import { notificationSummary, useNotificationPrefs } from "./notificationPrefs";
import { ProfileHeader } from "./ProfileHeader";
import { SignInPreviewRow, SignOutRow, useAuthSettings } from "@/features/auth"; // identity
import { downloadSignedInExport } from "@/features/auth/exportData"; // identity
import { errorMessage } from "@/lib/api/errors"; // identity
import { IdentityRow, KYC_ENABLED } from "@/features/kyc"; // identity
import { RecoveryRow, useRecoveryPending } from "@/features/recovery"; // identity
import { ALERTS_ENABLED, ALERTS_ROUTE, useAlerts } from "@/features/alerts"; // alerts
import { DEVICES_ENABLED, DEVICES_ROUTE } from "@/features/devices"; // devices
import { PHONE_VERIFY_ENABLED, VERIFY_PHONE_ROUTE } from "@/features/phone-verify"; // devices

/** Profile & settings (pushed from the avatar). Groups in order of how often people need them. */
export function SettingsHome() {
  const me = useMe();
  const { pref, cvdGains, setCvdGains } = useTheme();
  const conn = useConnection();
  const practice = usePracticeMode();
  const limits = useLimits();
  const level = useHapticLevel();
  const notif = useNotificationPrefs();
  const identity = useAuthSettings(); // identity
  const recoveryPending = useRecoveryPending(); // identity
  // A failed export keeps the address it tried, so the note stays right if the data source changes.
  const [exportNote, setExportNote] = useState<"demo" | "signedIn" | { signedInError: unknown } | { failedUrl: string } | null>(null);

  const exportData = async () => {
    // Practice has nothing to export (exportUrl is null there).
    const url = api.exportUrl();
    if (!url) return setExportNote("demo");
    // identity: signed in, the export needs the sign-in token, which an opened browser can't send.
    if (identity.signedIn) {
      try {
        setExportNote((await downloadSignedInExport(url)) === "saved" ? null : "signedIn");
      } catch (e) {
        setExportNote({ signedInError: e });
      }
      return;
    }
    try {
      await Linking.openURL(url);
      setExportNote(null);
    } catch {
      setExportNote({ failedUrl: url });
    }
  };

  const l = limits.data;
  const limitsSummary = l ? `${moneyWhole(l.limits.singleWithdrawal, l.currency)} per withdrawal · ${moneyWhole(l.limits.dailyWithdrawal, l.currency)} a day` : "Withdrawal and emergency limits";

  return (
    <Page title="Profile & settings" onRefresh={() => Promise.all([me.refetch(), limits.refetch()])}>
      <ProfileHeader me={me.data} loading={me.isPending} error={me.error} onRetry={() => void me.refetch()} />

      <SecurityGroup />

      <Group title="Limits">
        <ListRow icon={SlidersIcon} title="Your limits" subtitle={limitsSummary} onPress={() => router.push("/settings/limits")} />
      </Group>

      <Group title="Feel & look">
        <ListRow icon={VibrateIcon} title="Haptics & sounds" subtitle={`Haptics: ${hapticLevelLabel(level)}`} onPress={() => router.push("/settings/haptics")} />
        {appearanceSettingAvailable ? (
          <ListRow icon={PaletteIcon} title="Appearance" subtitle={appearanceLabel(pref)} onPress={() => router.push("/settings/appearance")} />
        ) : null}
        <ToggleRow
          icon={EyeIcon}
          title="Colour-blind friendly gains and losses"
          subtitle="Blue for up and orange for down, instead of green and red."
          value={cvdGains}
          onChange={setCvdGains}
        />
      </Group>

      <Group title="Notifications">
        {/* alerts */}
        {ALERTS_ENABLED ? <AlertsRow /> : null}
        <ListRow icon={BellIcon} title="Notifications" subtitle={notificationSummary(notif)} onPress={() => router.push("/settings/notifications")} />
      </Group>

      <Group title="App">
        {/* The store build is Practice only, with no server address to choose (lib/build.ts). */}
        {PRACTICE_ONLY ? (
          <ListRow icon={GlobeIcon} title="Practice" subtitle="Everything is simulated on this phone. No real money moves." />
        ) : (
          <ListRow
            icon={GlobeIcon}
            title="Data source"
            subtitle={conn.lastError ? `${connectionLabel(conn.mode)} · server not answering` : connectionLabel(conn.mode)}
            onPress={() => router.push("/settings/connection")}
          />
        )}
        <ListRow icon={ShieldCheckIcon} title="Trust centre" subtitle="Who holds your money, fees and your data" onPress={() => router.push("/settings/trust")} />
      </Group>

      <Group title="Help & legal">
        <ListRow icon={HeadsetIcon} title="Talk to a person" subtitle="Get help from a real person" onPress={() => router.push("/support")} />
        <ListRow icon={FileTextIcon} title="Privacy policy" onPress={() => router.push({ pathname: "/settings/about", params: { doc: "privacy" } })} />
        <ListRow icon={FileTextIcon} title="Terms of use" onPress={() => router.push({ pathname: "/settings/about", params: { doc: "terms" } })} />
        <ListRow icon={InfoIcon} title="About Vaultwise" onPress={() => router.push({ pathname: "/settings/about", params: { doc: "about" } })} />
      </Group>

      <Group title="Account">
        {/* identity: ID check, a waiting recovery request, the Practice sign-in preview */}
        {KYC_ENABLED ? <IdentityRow /> : null}
        {recoveryPending ? <RecoveryRow /> : null}
        {identity.preview ? <SignInPreviewRow /> : null}
        <ListRow icon={ExportIcon} title="Export my data" subtitle="A copy of everything, as a file" onPress={() => void exportData()} />
        {/* identity */}
        {identity.signedIn ? <SignOutRow email={identity.email} /> : null}
        {/* Practice data is saved on the phone, so it needs its own way back to the sample account. */}
        {practice ? (
          <ListRow
            icon={ArrowsClockwiseIcon}
            title="Start Practice over"
            subtitle="Puts back the sample account and its pretend money"
            onPress={() => router.push("/settings/start-over" as Href)}
          />
        ) : null}
        <ListRow icon={TrashIcon} title="Delete account" destructive onPress={() => router.push("/settings/delete-account")} />
      </Group>
      {exportNote === "demo" ? (
        <Banner tone="info" title="Nothing to export in demo mode" body="Practice data lives only on this phone. Connect to the Vaultwise server to export your account." />
      ) : exportNote === "signedIn" ? (
        <Banner tone="info" title="Export isn't in the app yet" body="While you're signed in, get your copy from Vaultwise on the web. Sign in there with the same email." />
      ) : exportNote && "signedInError" in exportNote ? (
        <Banner tone="warning" title="The export didn't download" body={errorMessage(exportNote.signedInError)} />
      ) : exportNote ? (
        <Banner tone="warning" title="The export didn't open" body={`Open ${exportNote.failedUrl} in a browser on this network.`} />
      ) : null}
    </Page>
  );
}

/** App lock, the MPIN and Face ID / fingerprint. One PIN: the MPIN approves money moves and unlocks the app. */
function SecurityGroup() {
  const session = useSession();
  const kind = useBiometricKind();
  const bio = biometricName(kind);
  const onLock = (on: boolean) => {
    if (on && session.hasDevicePin) void setLockEnabled(true);
    else router.push({ pathname: "/settings/security", params: { intent: on ? "lock" : "off" } });
  };
  return (
    <Group title="Security">
      <ToggleRow
        icon={LockKeyIcon}
        title="App lock"
        subtitle={session.lockEnabled ? `Asks for ${bio ?? "your MPIN"} when Vaultwise opens` : "Off. Turn on to ask for your MPIN when Vaultwise opens."}
        value={session.lockEnabled}
        onChange={onLock}
      />
      {/* mpin: the server checks the current MPIN (POST /mpin); this phone's unlock PIN follows */}
      <ListRow
        icon={PasswordIcon}
        title="Change MPIN"
        subtitle="Approves money moves and unlocks Vaultwise"
        onPress={() => router.push({ pathname: "/settings/security", params: { intent: "change" } })}
      />
      {/* devices: a code to the verified phone, then a new MPIN */}
      <ListRow icon={PasswordIcon} title="Forgot your MPIN?" subtitle="Reset it with a code sent to your phone" onPress={() => router.push(RESET_MPIN_ROUTE as Href)} />
      <BiometricRow kind={kind} lockOn={session.lockEnabled} bioOn={session.biometricUnlock} />
      <PaymentsBiometricRow kind={kind} hasPin={session.hasDevicePin} />
      {/* devices */}
      {DEVICES_ENABLED ? <DevicesRow /> : null}
      {PHONE_VERIFY_ENABLED ? <PhoneRow /> : null}
    </Group>
  );
}

/**
 * mpin: "Use Face ID / fingerprint for payments". Turning it on needs the MPIN; turning it off needs
 * nothing. Live only: it holds the live MPIN, so Practice shows it off and can't turn it on.
 */
function PaymentsBiometricRow({ kind, hasPin }: { kind: Biometric | undefined; hasPin: boolean }) {
  const on = useMpinShortcut();
  const practice = usePracticeMode();
  const face = kind === "face" || (!kind && Platform.OS === "ios");
  const name = face ? "Face ID" : "fingerprint";
  const subtitle =
    Platform.OS === "web"
      ? "Not available in the web preview"
      : practice
        ? "Live only. Practice money moves ask for your MPIN."
        : !kind
          ? `Set up ${Platform.OS === "ios" ? "Face ID" : "a fingerprint"} on this phone first`
          : !hasPin
            ? "Approve a money move with your MPIN first"
            : on
              ? `Money moves ask for ${name} first. Your MPIN always works too.`
              : "Off. Money moves ask for your MPIN.";
  return (
    <ToggleRow
      icon={face ? ScanSmileyIcon : FingerprintIcon}
      title={`Use ${name} for payments`}
      subtitle={subtitle}
      value={on}
      disabled={!on && (Platform.OS === "web" || practice || !kind || !hasPin)}
      onChange={(next) => {
        if (next) router.push({ pathname: "/settings/security", params: { intent: "bio" } });
        else void turnOffMpinShortcut();
      }}
    />
  );
}

// protection: unlock by Face ID / fingerprint is its own choice (session.biometricUnlock), only used while app lock is on.
function BiometricRow({ kind, lockOn, bioOn }: { kind: Biometric | undefined; lockOn: boolean; bioOn: boolean }) {
  const name = kind === "face" ? "Face ID" : kind === "finger" ? "Fingerprint" : Platform.OS === "ios" ? "Face ID" : "Fingerprint";
  const Icon = kind === "face" || (kind === undefined && Platform.OS === "ios") ? ScanSmileyIcon : FingerprintIcon;
  const subtitle =
    Platform.OS === "web"
      ? "Not available in the web preview"
      : kind === undefined
        ? "Checking this phone…"
        : kind === null
          ? "Not set up on this phone. Add it in your phone's settings."
          : !lockOn
            ? "Works when app lock is on"
            : bioOn
              ? "Unlocks Vaultwise. Your MPIN always works too."
              : "Off. Tap to use it to unlock Vaultwise.";
  const on = !!kind && lockOn && bioOn;
  const pill = kind ? <StatusPill tone={on ? "success" : "neutral"} label={on ? "On" : "Off"} /> : <StatusPill tone="neutral" label="Unavailable" />;
  // Off with lock on: the Security flow's "lock" step checks the biometric and turns it back on.
  const onPress = kind && lockOn && !bioOn ? () => router.push({ pathname: "/settings/security", params: { intent: "lock" } }) : undefined;
  return (
    <ListRow
      icon={Icon}
      title={name}
      subtitle={subtitle}
      trailing={kind === undefined ? undefined : pill}
      onPress={onPress}
      accessibilityLabel={`${name}. ${subtitle}`}
    />
  );
}

// devices: Your devices, with this phone's trust in the subtitle.
function DevicesRow() {
  const me = useMe();
  const device = me.data?.onboarded ? me.data.device : undefined;
  const trust = phoneTrust(device);
  const subtitle =
    trust === "cooling"
      ? "This phone isn't trusted yet. Trust it, or sign out others."
      : trust === "needs_code"
        ? "This phone needs a code to be trusted. Trust it, or sign out others."
        : trust === "unrecognised"
          ? "This phone couldn't be added to your account just now"
          : "Phones signed in to your account";
  return <ListRow icon={DeviceMobileIcon} title="Your devices" subtitle={subtitle} onPress={() => router.push(DEVICES_ROUTE as Href)} />;
}

// devices: the verified number (masked), or a prompt to add one.
function PhoneRow() {
  const me = useMe();
  const phone = me.data?.onboarded ? me.data.phone : undefined;
  const verified = !!phone?.verified;
  return (
    <ListRow
      icon={PhoneIcon}
      title="Phone number"
      subtitle={verified ? `${phone?.number ?? "Verified"} · for codes` : "Add one for codes when you trust a phone or reset your MPIN"}
      trailing={verified ? <StatusPill tone="success" label="Verified" /> : <StatusPill tone="warning" label="Not added" />}
      onPress={() => router.push(VERIFY_PHONE_ROUTE as Href)}
    />
  );
}

// alerts: the inbox, with how many are unread.
function AlertsRow() {
  const alerts = useAlerts();
  const unread = alerts.data?.unread ?? 0;
  return (
    <ListRow
      icon={BellIcon}
      title="Alerts"
      subtitle={unread > 0 ? (unread === 1 ? "1 unread" : `${unread} unread`) : "Sign-ins, devices and money going out"}
      onPress={() => router.push(ALERTS_ROUTE as Href)}
    />
  );
}
