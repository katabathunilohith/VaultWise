"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CircleCheck, CircleX, Hourglass, IdCard, Lock, ScanSearch } from "lucide-react";
import { api, refreshAll, useApi } from "@/lib/client";
import { timeAgo } from "@/lib/shared";
import { useMe } from "@/components/shell";
import { Badge, Card, CardTitle, ErrorNote, KV, LinkButton, Notice, PageHeader, Skeleton, useToast, type Tone } from "@/components/ui";
import { IdForm, idFormData, type IdSubmission } from "./id-form";
import { docLabel, docTypesFor, endingIn, kycStatusOf, readKyc, type KycStatus, type KycView } from "./types";

const KYC_URL = "/api/v1/kyc";

export const KYC_COPY: Record<KycStatus, { label: string; tone: Tone; title: string; body: string }> = {
  not_started: {
    label: "Not started",
    tone: "neutral",
    title: "Your ID isn't verified yet",
    body: "Add a photo of your ID. Once it's verified you can move money.",
  },
  pending: {
    label: "Checking",
    tone: "info",
    title: "We're checking your ID",
    body: "This usually takes a minute or two. This page updates by itself.",
  },
  needs_review: {
    label: "With a person",
    tone: "warn",
    title: "A person is checking your ID",
    body: "Our automatic check wasn't sure, so a person will look at it. We'll update this page when they're done.",
  },
  verified: {
    label: "Verified",
    tone: "good",
    title: "Your ID is verified",
    body: "You can move money. You don't need to do this again.",
  },
  rejected: {
    label: "Not verified",
    tone: "bad",
    title: "We couldn't verify your ID",
    body: "Try again with a clearer photo, or use a different ID.",
  },
};

function StatusIcon({ status }: { status: KycStatus }) {
  const cls = "size-6 shrink-0";
  if (status === "verified") return <CircleCheck className={`${cls} text-good`} aria-hidden />;
  if (status === "rejected") return <CircleX className={`${cls} text-bad`} aria-hidden />;
  if (status === "pending") return <ScanSearch className={`${cls} text-accent`} aria-hidden />;
  if (status === "needs_review") return <Hourglass className={`${cls} text-warn`} aria-hidden />;
  return <IdCard className={`${cls} text-muted`} aria-hidden />;
}

function StatusCard({ view }: { view: KycView }) {
  const c = KYC_COPY[view.status];
  return (
    <Card>
      <div className="flex items-start gap-3">
        <StatusIcon status={view.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold">{c.title}</h2>
            <Badge tone={c.tone}>{c.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-2">{c.body}</p>
        </div>
      </div>
      {view.reasons.length > 0 && view.status !== "verified" && (
        <div className="mt-4 rounded-lg bg-sunken px-3.5 py-3">
          <div className="text-[13px] font-medium">{view.status === "rejected" ? "Why" : "What we noticed"}</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] text-ink-2">
            {view.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {(view.docType || view.updatedAt) && view.status !== "not_started" && (
        <div className="mt-4 divide-y divide-line text-[13px]">
          {view.docType && <KV k="ID" v={`${docLabel(view.docType)} ${endingIn(view.idLast4)}`.trim()} />}
          {view.updatedAt && <KV k="Updated" v={timeAgo(view.updatedAt)} />}
        </div>
      )}
    </Card>
  );
}

function Keeps() {
  const rows: { icon: ReactNode; text: string }[] = [
    { icon: <Lock className="size-4" />, text: "We never store your full ID number. We keep the last 4 digits so we can match it later." },
    { icon: <IdCard className="size-4" />, text: "We keep the photo so a person can look at it if our automatic check isn't sure." },
    { icon: <ScanSearch className="size-4" />, text: "We check the name on the ID matches the name on your account." },
  ];
  return (
    <Card>
      <CardTitle>What we keep</CardTitle>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.text} className="flex items-start gap-3 text-[13px] text-ink-2">
            <span className="mt-0.5 text-muted">{r.icon}</span>
            {r.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The /verify page: send an ID, then see where the check is at. */
export function KycPage() {
  const me = useMe();
  const toast = useToast();
  const fromMe: KycView = { status: kycStatusOf(me), docType: me.kyc?.docType ?? null, idLast4: me.kyc?.idLast4 ?? null, reasons: [], updatedAt: null };
  const { data, error, reload } = useApi<unknown>(KYC_URL);
  const view = readKyc(data) ?? fromMe;
  const waiting = view.status === "pending" || view.status === "needs_review";

  // While a check is running, look again every 15 seconds.
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(reload, 15_000);
    return () => clearInterval(id);
  }, [waiting, reload]);

  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const recovering = me.auth?.access === "recovery";

  const submit = async (s: IdSubmission) => {
    setErr(null);
    setBusy(true);
    try {
      const next = readKyc(await api.upload(KYC_URL, idFormData(s)));
      await reload();
      me.reload();
      refreshAll();
      setAttempt((n) => n + 1);
      if (next?.status === "verified") toast({ tone: "good", text: "Your ID is verified." });
      else if (next?.status === "rejected") toast({ tone: "bad", text: "We couldn't verify that ID." });
      else toast({ tone: "info", text: "Got it. We're checking your ID." });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // While a check runs the server refuses another one (409 kyc_in_review), so the form only shows before and after.
  const canSend = !recovering && (view.status === "not_started" || view.status === "rejected");

  if (!data && !error)
    return (
      <div>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-6 h-80" />
      </div>
    );

  return (
    <div className="vw-in">
      <PageHeader
        eyebrow="Settings"
        title="Verify your ID"
        subtitle="We check your ID once. After that you can move money out of your vaults."
        actions={
          view.status === "verified" ? (
            <LinkButton href="/" variant="secondary">
              Go to overview
            </LinkButton>
          ) : undefined
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-5">
          <StatusCard view={view} />
          <Keeps />
        </div>
        <div>
          {recovering ? (
            <Notice tone="warn" title="Your account is being checked">
              You can&apos;t change your ID until a person confirms it&apos;s you.
            </Notice>
          ) : canSend ? (
            <Card>
              <CardTitle sub="Use an ID with your photo and your name as it is on your account.">
                {view.status === "rejected" ? "Send another ID" : "Add your ID"}
              </CardTitle>
              <IdForm
                key={attempt}
                docTypes={docTypesFor(me.user.jurisdiction)}
                market={me.user.jurisdiction}
                photo="required"
                submitLabel="Check my ID"
                busy={busy}
                onSubmit={submit}
                footer={err && <ErrorNote>{err}</ErrorNote>}
              />
            </Card>
          ) : view.status === "verified" ? (
            <Notice tone="good" title="All done">
              Your {`${docLabel(view.docType)} ${endingIn(view.idLast4)}`.trim()} is on file.
            </Notice>
          ) : null}
        </div>
      </div>
    </div>
  );
}
