"use client";

import { useState } from "react";
import { Bell, Phone, Smartphone } from "lucide-react";
import { api, ApiError, useApi, useNow } from "@/lib/client";
import { useMe } from "@/components/shell";
import { Badge, Button, Card, CardTitle, Empty, ErrorNote, Field, Input, Notice, Skeleton, useToast } from "@/components/ui";
import { moneyErrorText, MpinField, mpinReady } from "@/components/mpin";

/**
 * devices: the web's "Devices and alerts" settings section (plan 06): the verified phone number (set
 * with a texted code and the MPIN), the devices signed in to the account with sign-out, trusting this
 * browser (texted code and MPIN), and recent alerts. With sign-in on, this browser sends its own device
 * id (identity/device.ts), so it is listed and marked "This device".
 */

interface DeviceView {
  id: string;
  platform: "ios" | "android" | "web" | null;
  appVersion: string | null;
  firstSeen: number;
  lastSeen: number;
  trusted: boolean;
  trustableAt: number | null;
  current: boolean;
}

interface AlertView {
  id: string;
  kind: string;
  title: string;
  body: string;
  createdAt: number;
  readAt: number | null;
}

interface SentOtp {
  otpId: string;
  expiresAt: number;
  sentTo: string;
  testCode?: string;
}

const PLATFORM: Record<string, string> = { ios: "iPhone", android: "Android phone", web: "Web browser" };
const when = (ts: number) => new Date(ts).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function DevicesAlertsCard({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardTitle sub="Your verified phone number, the phones and browsers signed in to your account, and what happened recently">
        <span className="inline-flex items-center gap-2">
          <Smartphone className="size-4" /> Devices and alerts
        </span>
      </CardTitle>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <PhoneNumber />
        <Devices />
        <RecentAlerts />
      </div>
    </Card>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
      {icon} {children}
    </div>
  );
}

/* ---------- Phone number ---------- */

function PhoneNumber() {
  const me = useMe() as ReturnType<typeof useMe> & { phone?: { number: string | null; verified: boolean } };
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<SentOtp | null>(null);
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  // The token a right code gave. Kept after a wrong MPIN, so the person retypes only the MPIN (the code is used up).
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setSent(null);
    setCode("");
    setPin("");
    setToken(null);
  };

  const sendCode = async () => {
    setBusy("send");
    setErr(null);
    try {
      setSent(await api.post<SentOtp>("/api/v1/otp/send", { purpose: "phone_verify", phone }));
      setCode("");
      setPin("");
      setToken(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // Adding or changing the number needs the MPIN (POST /me/phone checks it), because the number receives the codes.
  const verify = async () => {
    if (!sent) return;
    setBusy("verify");
    setErr(null);
    try {
      let verificationToken = token;
      if (!verificationToken) {
        verificationToken = (await api.post<{ verificationToken: string }>("/api/v1/otp/verify", { otpId: sent.otpId, code })).verificationToken;
        setToken(verificationToken);
      }
      await api.post("/api/v1/me/phone", { verificationToken, pin });
      toast({ tone: "good", text: "Phone number verified." });
      reset();
      setPhone("");
      me.reload();
    } catch (e) {
      // An expired or used check means starting again with a new code.
      if (e instanceof ApiError && e.code === "verification_invalid") reset();
      setErr(moneyErrorText(e, () => setPin("")));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <SectionTitle icon={<Phone className="size-3.5" />}>Phone number</SectionTitle>
      <div className="mb-3">
        {me.phone?.verified ? (
          <Badge tone="good">{me.phone.number} · verified</Badge>
        ) : (
          <Badge tone="warn">No verified number yet</Badge>
        )}
      </div>
      <p className="mb-3 text-xs text-muted">
        Codes for trusting a new phone and resetting a forgotten MPIN go to this number. A new number can reset your MPIN after 72 hours.
      </p>
      {!sent ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field label={me.phone?.verified ? "New number" : "Mobile number"} hint="With the country code, like +91 98765 43210">
            <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="max-w-[220px]" />
          </Field>
          <Button size="sm" variant="secondary" loading={busy === "send"} disabled={phone.replace(/\D/g, "").length < 8} onClick={sendCode}>
            Send code
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Notice tone="info">We texted a 6-digit code to {sent.sentTo}. It works for 5 minutes.</Notice>
          {sent.testCode && (
            <Notice tone="warn" title="Test mode">
              No text was sent. Your code is <span className="font-mono font-semibold">{sent.testCode}</span>.
            </Notice>
          )}
          <div className="flex flex-wrap items-end gap-3">
            {!token && (
              <Field label="Code">
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  maxLength={6}
                  className="max-w-[140px] font-mono"
                />
              </Field>
            )}
            <MpinField value={pin} onChange={setPin} hint="Adding or changing your number needs your MPIN." />
            <Button size="sm" loading={busy === "verify"} disabled={(!token && code.length !== 6) || !mpinReady(pin)} onClick={verify}>
              Verify
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {err && (
        <div className="mt-3">
          <ErrorNote>{err}</ErrorNote>
        </div>
      )}
    </div>
  );
}

/* ---------- Devices ---------- */

function Devices() {
  const { data, loading, reload } = useApi<{ devices: DeviceView[] }>("/api/v1/devices");
  const toast = useToast();
  const now = useNow(60_000);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const signOut = async (id: string) => {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/v1/devices/${id}/revoke`, { pin });
      toast({ tone: "good", text: "Device signed out." });
      setRevoking(null);
      setPin("");
      reload();
    } catch (e) {
      setErr(moneyErrorText(e, () => setPin("")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionTitle icon={<Smartphone className="size-3.5" />}>Signed-in devices</SectionTitle>
      {loading && !data ? (
        <Skeleton className="h-24" />
      ) : !data?.devices.length ? (
        <Empty title="No devices yet" body="Phones and browsers show here once you sign in on them." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {data.devices.map((d) => (
            <li key={d.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {PLATFORM[d.platform ?? ""] ?? "Device"}
                    {d.current && <Badge tone="info">This device</Badge>}
                    {d.trusted ? (
                      <Badge tone="good">Trusted</Badge>
                    ) : (
                      <Badge tone="warn">
                        New{d.trustableAt && d.trustableAt > now ? ` · limited until ${when(d.trustableAt)}` : d.trustableAt === null ? " · limited until trusted" : ""}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {d.appVersion ? `App ${d.appVersion} · ` : ""}Last used {when(d.lastSeen)} · First seen {when(d.firstSeen)}
                  </div>
                </div>
                {revoking !== d.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRevoking(d.id);
                      setPin("");
                      setErr(null);
                    }}
                  >
                    Sign out
                  </Button>
                )}
              </div>
              {revoking === d.id && (
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <MpinField value={pin} onChange={setPin} hint="Signing a device out needs your MPIN." autoFocus />
                  <Button size="sm" variant="danger" loading={busy} disabled={!mpinReady(pin)} onClick={() => signOut(d.id)}>
                    Sign out
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRevoking(null)}>
                    Cancel
                  </Button>
                </div>
              )}
              {d.current && !d.trusted && revoking !== d.id && <TrustThisDevice onTrusted={reload} />}
            </li>
          ))}
        </ul>
      )}
      {err && (
        <div className="mt-3">
          <ErrorNote>{err}</ErrorNote>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        A new phone or browser can send only small amounts for its first 24 hours, unless you trust it with a texted code and your MPIN. One that first signs
        in after you signed a device out stays limited until you trust it.
      </p>
    </div>
  );
}

/** devices: trusts this browser with a texted code (to the verified number) and the MPIN (POST /devices/trust). */
function TrustThisDevice({ onTrusted }: { onTrusted: () => void }) {
  const toast = useToast();
  const [sent, setSent] = useState<SentOtp | null>(null);
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      setSent(await api.post<SentOtp>("/api/v1/otp/send", { purpose: "device_trust" }));
      setCode("");
      setToken(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const trust = async () => {
    if (!sent) return;
    setBusy(true);
    setErr(null);
    try {
      let verificationToken = token;
      if (!verificationToken) {
        verificationToken = (await api.post<{ verificationToken: string }>("/api/v1/otp/verify", { otpId: sent.otpId, code })).verificationToken;
        setToken(verificationToken);
      }
      await api.post("/api/v1/devices/trust", { verificationToken, pin });
      toast({ tone: "good", text: "This device is trusted." });
      onTrusted();
    } catch (e) {
      if (e instanceof ApiError && e.code === "verification_invalid") {
        setSent(null);
        setToken(null);
      }
      setErr(moneyErrorText(e, () => setPin("")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-3">
      {!sent ? (
        <Button size="sm" variant="secondary" loading={busy} onClick={send}>
          Trust this device
        </Button>
      ) : (
        <>
          <Notice tone="info">We texted a 6-digit code to {sent.sentTo}.</Notice>
          {sent.testCode && (
            <Notice tone="warn" title="Test mode">
              No text was sent. Your code is <span className="font-mono font-semibold">{sent.testCode}</span>.
            </Notice>
          )}
          <div className="flex flex-wrap items-end gap-3">
            {!token && (
              <Field label="Code">
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  maxLength={6}
                  className="max-w-[140px] font-mono"
                />
              </Field>
            )}
            <MpinField value={pin} onChange={setPin} hint="Trusting a device needs your MPIN." />
            <Button size="sm" loading={busy} disabled={(!token && code.length !== 6) || !mpinReady(pin)} onClick={trust}>
              Trust
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSent(null)}>
              Cancel
            </Button>
          </div>
        </>
      )}
      {err && <ErrorNote>{err}</ErrorNote>}
    </div>
  );
}

/* ---------- Alerts ---------- */

function RecentAlerts() {
  const { data, loading, reload } = useApi<{ alerts: AlertView[]; unread: number }>("/api/v1/alerts?limit=10");
  const [busy, setBusy] = useState(false);

  const markAll = async () => {
    setBusy(true);
    try {
      await api.post("/api/v1/alerts/read", {});
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <SectionTitle icon={<Bell className="size-3.5" />}>Recent alerts{data?.unread ? ` · ${data.unread} new` : ""}</SectionTitle>
        {!!data?.unread && (
          <Button size="sm" variant="ghost" loading={busy} onClick={markAll} className="-mt-1.5">
            Mark all read
          </Button>
        )}
      </div>
      {loading && !data ? (
        <Skeleton className="h-24" />
      ) : !data?.alerts.length ? (
        <Empty title="No alerts yet" body="New sign-ins, money sent and security changes show here." />
      ) : (
        <ul className="space-y-3">
          {data.alerts.map((a) => (
            <li key={a.id} className="text-[13px]">
              <div className="flex items-center gap-2">
                {a.readAt === null && <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                <span className={a.readAt === null ? "font-semibold" : "font-medium"}>{a.title}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">{when(a.createdAt)}</span>
              </div>
              <p className="mt-0.5 text-xs text-ink-2">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
