import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Banner, Button, Segmented, StatusPill, Txt } from "@/components/ui";
import { applyConnection, defaultBaseUrl, type ConnectionPref } from "@/lib/api/connection";
import { useConnection } from "@/lib/api/hooks";
import { haptic } from "@/lib/haptics";
import { space } from "@/theme";
import { Group } from "../controls";
import { Page } from "../layout";
import { TextField } from "../onboarding/TextField";

const PREFS: { value: ConnectionPref; label: string; body: string }[] = [
  { value: "auto", label: "Auto", body: "Uses the Vaultwise server when it answers, and demo data when it doesn't." },
  { value: "live", label: "Live server", body: "Always uses the server at the address below. You'll see errors if it can't be reached." },
  { value: "demo", label: "Demo data", body: "Sample data on this phone only. Nothing is sent anywhere, and it resets when the app restarts." },
];

export const connectionLabel = (mode: "live" | "demo") => (mode === "live" ? "Live server" : "Demo data");

function normalise(url: string) {
  return url.trim().replace(/\/+$/, "");
}

type TestResult = { ok: true; ms: number } | { ok: false; text: string };

/** Asks the server for /me without switching anything, so the result can be shown here. */
async function testServer(baseUrl: string): Promise<TestResult> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`${baseUrl}/api/v1/me`, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, text: `The server answered with an error (${res.status}).` };
    return { ok: true, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, text: (e as Error)?.name === "AbortError" ? "The server didn't answer within 4 seconds." : "Couldn't reach a server at this address." };
  } finally {
    clearTimeout(timer);
  }
}

/** Where the app gets its data: Auto, the live server, or demo data on the phone. */
export function ConnectionScreen() {
  const conn = useConnection();
  const [pref, setPref] = useState<ConnectionPref>(conn.pref);
  const [url, setUrl] = useState(conn.baseUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const clean = normalise(url);
  const validUrl = /^https?:\/\/[^\s/]+/i.test(clean);
  const changed = pref !== conn.pref || (pref !== "demo" && clean !== conn.baseUrl);

  const test = async () => {
    if (!validUrl) {
      setUrlError("Start the address with http:// or https://");
      haptic("error");
      return;
    }
    setTesting(true);
    setResult(null);
    const r = await testServer(clean);
    setTesting(false);
    setResult(r);
    if (!r.ok) haptic("error");
  };

  const save = () => {
    if (pref !== "demo" && !validUrl) {
      setUrlError("Start the address with http:// or https://");
      haptic("error");
      return;
    }
    // Switching reloads the app on the new source (the root waits for the check to finish).
    void applyConnection(pref, pref === "demo" ? conn.baseUrl : clean);
  };

  return (
    <Page title="Data source" keyboard>
      <Group title="Now using">
        <View style={styles.status}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="labelL">{connectionLabel(conn.mode)}</Txt>
            <Txt v="bodyM" color="textMuted" numberOfLines={1}>
              {conn.mode === "live" ? conn.baseUrl : "Sample data on this phone"}
            </Txt>
          </View>
          <StatusPill tone={conn.lastError ? "warning" : "success"} label={conn.lastError ? "Problem" : "Working"} />
        </View>
      </Group>
      {conn.lastError ? (
        <Banner
          tone="warning"
          title={conn.pref === "auto" && conn.mode === "demo" ? "Using demo data for now" : "The server isn't answering"}
          body={`${conn.lastError} at ${conn.baseUrl}.`}
        />
      ) : null}

      <View style={{ gap: space.sm }}>
        <Txt v="labelM" color="textMuted" accessibilityRole="header">
          Get data from
        </Txt>
        <Segmented value={pref} options={PREFS.map((p) => ({ value: p.value, label: p.label }))} onChange={setPref} />
        <Txt v="bodyM" color="textMuted">
          {PREFS.find((p) => p.value === pref)?.body}
        </Txt>
      </View>

      {pref !== "demo" ? (
        <View style={{ gap: space.sm }}>
          <TextField
            label="Server address"
            value={url}
            onChangeText={(t) => {
              setUrl(t);
              setUrlError(null);
              setResult(null);
            }}
            placeholder="http://192.168.1.20:3000"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
            returnKeyType="done"
            hint="The computer running the Vaultwise server, on port 3000."
            error={urlError}
          />
          <View style={styles.row}>
            <Button label="Test connection" variant="tonal" size="md" loading={testing} onPress={() => void test()} style={{ flex: 1 }} />
            <Button
              label="Use default"
              variant="ghost"
              size="md"
              onPress={() => {
                setUrl(defaultBaseUrl());
                setUrlError(null);
                setResult(null);
              }}
              style={{ flex: 1 }}
            />
          </View>
          {result ? (
            result.ok ? (
              <Banner tone="success" title="Connected" body={`The server answered in ${result.ms} ms.`} />
            ) : (
              <Banner tone="warning" title="No answer" body={`${result.text} Check that the server is running and your phone is on the same network.`} />
            )
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: space.xs }}>
        <Button label="Save and switch" disabled={!changed} onPress={save} />
        <Txt v="caption" color="textMuted" align="center">
          {changed ? "Vaultwise reloads on the new source. Live and demo accounts are separate." : "Nothing to save yet."}
        </Txt>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  status: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  row: { flexDirection: "row", gap: space.sm },
});
