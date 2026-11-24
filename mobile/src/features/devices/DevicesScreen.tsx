import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { DesktopIcon, DeviceMobileIcon, PhoneIcon, UsersIcon } from "@/components/icons";
import { Banner, Button, ListRow, Skeleton, StatusPill, Txt } from "@/components/ui";
import { CalmError, Group } from "@/features/account/controls";
import { Page } from "@/features/account/layout";
import { phoneTrust, TRUST_PHONE_ROUTE, UNRECOGNISED_TEXT, UNRECOGNISED_TITLE, untrustedText, withMpin } from "@/features/mpin";
import { api, practiceDeviceTools } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { queryClient, useApiQuery, useMe } from "@/lib/api/hooks";
import { invalidate, qk } from "@/lib/api/keys";
import { usePracticeMode } from "@/lib/api/practice";
import type { Device } from "@/lib/api/security-types";
import { layout, space, useTheme } from "@/theme";
import { deviceFirstLine, deviceNoun, deviceSeenLine, deviceTitle, sortDevices, trustLabel } from "./model";

/**
 * Your devices (plan 06): every install signed in to the account (platform, app version, when it
 * was last seen, this phone first), whether each is trusted, and Sign out for the others (MPIN).
 * This phone, while untrusted, says when large amounts can move and offers Trust this phone; one
 * that won't trust itself with time (first seen after a device was signed out) offers Trust with a
 * code; one the account couldn't add (too many new devices) gets a calm note and no button.
 */
export function DevicesScreen() {
  const devices = useApiQuery(qk.devices(), api.devices);
  const practice = usePracticeMode();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const list = devices.data ? sortDevices(devices.data) : [];
  const meQ = useMe();
  const listed = list.find((d) => d.current);
  // /me knows about this phone even when the list can't show it (an unrecognised phone isn't listed).
  const meDevice = meQ.data?.onboarded ? meQ.data.device : undefined;
  const thisPhone = meDevice ?? (listed ? { registered: true, trusted: listed.trusted, trustableAt: listed.trustableAt } : undefined);
  const trust = phoneTrust(thisPhone);

  const signOut = async (d: Device) => {
    setNote(null);
    try {
      const done = await withMpin(`Sign out this ${deviceNoun(d)}`, (pin) => api.revokeDevice(d.id, pin));
      if (!done) return;
      setNote({ ok: true, text: `That ${deviceNoun(d)} is signed out. It needs your password to sign in again.` });
    } catch (e) {
      setNote({ ok: false, text: errorMessage(e) });
    }
    void invalidate(queryClient, "devices", "alerts");
  };

  return (
    <Page title="Your devices" onRefresh={() => devices.refetch()}>
      {trust === "cooling" || trust === "needs_code" ? (
        <Banner
          tone="warning"
          title="This phone isn't trusted yet"
          body={untrustedText(trust === "cooling" ? (thisPhone?.trustableAt ?? null) : null)}
          action={{ label: trust === "needs_code" ? "Trust with a code" : "Trust this phone", onPress: () => router.push(TRUST_PHONE_ROUTE as Href) }}
        />
      ) : trust === "unrecognised" ? (
        <Banner tone="info" title={UNRECOGNISED_TITLE} body={UNRECOGNISED_TEXT} />
      ) : null}

      {note ? (
        <Banner tone={note.ok ? "success" : "warning"} title={note.ok ? "Signed out" : "That device is still signed in"} body={note.text} />
      ) : null}

      {devices.isPending ? (
        <Group title="Signed in">
          <LoadingRow />
          <LoadingRow />
        </Group>
      ) : devices.isError ? (
        <CalmError error={devices.error} title="Your devices didn't load" onRetry={() => void devices.refetch()} />
      ) : (
        <Group
          title="Signed in"
          note="Signing a device out ends its session straight away. It needs your password to sign in again, and starts untrusted."
        >
          {list.map((d) => (
            <DeviceRow key={d.id} device={d} onSignOut={() => void signOut(d)} />
          ))}
        </Group>
      )}

      <Txt v="bodyM" color="textMuted">
        A new phone can move only small amounts for its first 24 hours, unless you trust it with a code to your phone and your MPIN. A phone first used
        after you sign a device out waits for that code however long it&apos;s been. You get an alert each time a new device signs in.
      </Txt>

      {practice ? <PracticeTools /> : null}
    </Page>
  );
}

function DeviceRow({ device: d, onSignOut }: { device: Device; onSignOut: () => void }) {
  const { c } = useTheme();
  const Icon = d.platform === "web" ? DesktopIcon : DeviceMobileIcon;
  const name = deviceTitle(d);
  const seen = deviceSeenLine(d);
  const first = deviceFirstLine(d);
  const trust = trustLabel(d);
  return (
    <View style={styles.row} accessible={d.current} accessibilityLabel={d.current ? `${name}. ${seen}. ${trust}.` : undefined}>
      <Icon size={24} color={c.text} />
      <View style={styles.text}>
        <Txt v="labelL">{name}</Txt>
        <Txt v="bodyM" color="textMuted">
          {seen}
        </Txt>
        {first ? (
          <Txt v="caption" color="textMuted">
            {first}
          </Txt>
        ) : null}
        <View style={styles.pill}>
          <StatusPill tone={d.trusted ? "success" : "warning"} label={trust} />
        </View>
      </View>
      {d.current ? null : (
        <Button label="Sign out" variant="dangerOutline" size="sm" onPress={onSignOut} accessibilityHint={`Signs out this ${deviceNoun(d)}`} />
      )}
    </View>
  );
}

function LoadingRow() {
  return (
    <View style={styles.row}>
      <Skeleton width={24} height={24} />
      <View style={styles.text}>
        <Skeleton width="50%" />
        <Skeleton width="80%" height={14} />
      </View>
    </View>
  );
}

/** Practice only: try the new-phone rules without a second phone. */
function PracticeTools() {
  const refresh = () => void invalidate(queryClient, "devices", "me", "alerts");
  return (
    <Group title="Try it in Practice" note="These only change the Practice data on this phone.">
      <ListRow
        icon={UsersIcon}
        title="Pretend another phone signed in"
        subtitle="Adds an untrusted phone and a new sign-in alert, so you can sign it out."
        onPress={() => {
          practiceDeviceTools.signInElsewhere();
          refresh();
        }}
      />
      <ListRow
        icon={PhoneIcon}
        title="Start this phone over as new"
        subtitle="Large amounts wait 24 hours (after you sign a device out: until you trust it with a code), so you can try trusting it."
        onPress={() => {
          practiceDeviceTools.startAsNewPhone();
          refresh();
        }}
      />
    </Group>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: space.sm, minHeight: layout.rowMin },
  text: { flex: 1, gap: 2 },
  pill: { flexDirection: "row", marginTop: space.xxs },
});
