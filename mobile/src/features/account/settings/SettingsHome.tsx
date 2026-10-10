import { useState } from "react";
import { Linking, Platform } from "react-native";
import { router } from "expo-router";
import {
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
} from "@/components/icons";
import { Banner, ListRow, StatusPill, ToggleRow } from "@/components/ui";
import { api } from "@/lib/api/client";
import { useConnection, useLimits, useMe } from "@/lib/api/hooks";
import { useHapticLevel } from "@/lib/haptics";
import { moneyWhole } from "@/lib/money";
import { setLockEnabled, useSession } from "@/lib/session";
import { appearanceSettingAvailable, useTheme } from "@/theme";
import { Group } from "../controls";
import { Page } from "../layout";
import { biometricName, useBiometricKind, type Biometric } from "../pin";
import { appearanceLabel } from "./AppearanceScreen";
import { connectionLabel } from "./ConnectionScreen";
import { hapticLevelLabel } from "./hapticCatalog";
import { notificationSummary, useNotificationPrefs } from "./notificationPrefs";
import { ProfileHeader } from "./ProfileHeader";

/** Profile & settings (pushed from the avatar). Groups in order of how often people need them. */
export function SettingsHome() {
  const me = useMe();
  const { pref, cvdGains, setCvdGains } = useTheme();
  const conn = useConnection();
  const limits = useLimits();
  const level = useHapticLevel();
  const notif = useNotificationPrefs();
  const [exportNote, setExportNote] = useState<"demo" | "failed" | null>(null);

  const exportData = async () => {
    if (conn.mode !== "live") return setExportNote("demo");
    try {
      await Linking.openURL(api.exportUrl());
      setExportNote(null);
    } catch {
      setExportNote("failed");
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
        <ListRow icon={BellIcon} title="Notifications" subtitle={notificationSummary(notif)} onPress={() => router.push("/settings/notifications")} />
      </Group>

      <Group title="App">
        <ListRow
          icon={GlobeIcon}
          title="Data source"
          subtitle={conn.lastError ? `${connectionLabel(conn.mode)} · server not answering` : connectionLabel(conn.mode)}
          onPress={() => router.push("/settings/connection")}
        />
        <ListRow icon={ShieldCheckIcon} title="Trust centre" subtitle="Who holds your money, fees and your data" onPress={() => router.push("/settings/trust")} />
      </Group>

      <Group title="Help & legal">
        <ListRow icon={HeadsetIcon} title="Talk to a person" subtitle="Get help from a real person" onPress={() => router.push("/support")} />
        <ListRow icon={FileTextIcon} title="Privacy policy" onPress={() => router.push({ pathname: "/settings/about", params: { doc: "privacy" } })} />
        <ListRow icon={FileTextIcon} title="Terms of use" onPress={() => router.push({ pathname: "/settings/about", params: { doc: "terms" } })} />
        <ListRow icon={InfoIcon} title="About Vaultwise" onPress={() => router.push({ pathname: "/settings/about", params: { doc: "about" } })} />
      </Group>

      <Group title="Account">
        <ListRow icon={ExportIcon} title="Export my data" subtitle="A copy of everything, as a file" onPress={() => void exportData()} />
        <ListRow icon={TrashIcon} title="Delete account" destructive onPress={() => router.push("/settings/delete-account")} />
      </Group>
      {exportNote === "demo" ? (
        <Banner tone="info" title="Nothing to export in demo mode" body="Demo data lives only on this phone and resets when the app restarts. Connect to the Vaultwise server to export your account." />
      ) : exportNote === "failed" ? (
        <Banner tone="warning" title="The export didn't open" body={`Open ${api.exportUrl()} in a browser on this network.`} />
      ) : null}
    </Page>
  );
}

/** App lock, PIN and Face ID / fingerprint. App lock needs a PIN on this phone first. */
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
        subtitle={session.lockEnabled ? `Asks for ${bio ?? "your PIN"} when Vaultwise opens` : "Off. Turn on to ask for your PIN when Vaultwise opens."}
        value={session.lockEnabled}
        onChange={onLock}
      />
      <ListRow
        icon={PasswordIcon}
        title={session.hasDevicePin ? "Change PIN" : "Set a PIN"}
        subtitle="Unlocks Vaultwise on this phone"
        onPress={() => router.push({ pathname: "/settings/security", params: { intent: "change" } })}
      />
      <BiometricRow kind={kind} lockOn={session.lockEnabled} />
    </Group>
  );
}

function BiometricRow({ kind, lockOn }: { kind: Biometric | undefined; lockOn: boolean }) {
  const name = kind === "face" ? "Face ID" : kind === "finger" ? "Fingerprint" : Platform.OS === "ios" ? "Face ID" : "Fingerprint";
  const Icon = kind === "face" || (kind === undefined && Platform.OS === "ios") ? ScanSmileyIcon : FingerprintIcon;
  const subtitle =
    Platform.OS === "web"
      ? "Not available in the web preview"
      : kind === undefined
        ? "Checking this phone…"
        : kind === null
          ? "Not set up on this phone. Add it in your phone's settings."
          : lockOn
            ? "Unlocks Vaultwise. Your PIN always works too."
            : "Works when app lock is on";
  const pill = kind ? (lockOn ? <StatusPill tone="success" label="On" /> : <StatusPill tone="neutral" label="Off" />) : <StatusPill tone="neutral" label="Unavailable" />;
  return <ListRow icon={Icon} title={name} subtitle={subtitle} trailing={kind === undefined ? undefined : pill} accessibilityLabel={`${name}. ${subtitle}`} />;
}
