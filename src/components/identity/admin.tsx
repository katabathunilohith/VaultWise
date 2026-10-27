"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, CircleCheck, CircleX, IdCard, UserRoundSearch } from "lucide-react";
import { api, refreshAll, useApi, useNow } from "@/lib/client";
import { fmtDate, timeAgo } from "@/lib/shared";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  KV,
  LinkButton,
  PageHeader,
  Skeleton,
  StatusIcon,
  Tabs,
  Textarea,
  cx,
  useToast,
  type Tone,
} from "@/components/ui";
import { AuthedImage } from "./media";
import {
  docLabel,
  endingIn,
  readClaimQueue,
  readKycQueue,
  type AdminClaimItem,
  type AdminKycItem,
  type CheckLine,
  type ClaimStatus,
  type KycStatus,
} from "./types";

const KYC_QUEUE = "/api/v1/admin/kyc";
const RECOVERY_QUEUE = "/api/v1/admin/recovery";

const KYC_BADGE: Record<KycStatus, { tone: Tone; label: string }> = {
  not_started: { tone: "neutral", label: "Not started" },
  pending: { tone: "info", label: "Pending" },
  needs_review: { tone: "warn", label: "Needs review" },
  verified: { tone: "good", label: "Verified" },
  rejected: { tone: "bad", label: "Rejected" },
};

const CLAIM_BADGE: Record<ClaimStatus, { tone: Tone; label: string }> = {
  pending: { tone: "warn", label: "Waiting" },
  approved: { tone: "good", label: "Approved" },
  rejected: { tone: "bad", label: "Rejected" },
  cancelled: { tone: "neutral", label: "Cancelled" },
  expired: { tone: "neutral", label: "Expired" },
};

function idText(item: { docType: string | null; idLast4: string | null; maskedId: string | null }) {
  return item.maskedId ? `${docLabel(item.docType)} ${item.maskedId}` : `${docLabel(item.docType)} ${endingIn(item.idLast4)}`.trim();
}

function BackToOps() {
  return (
    <Link href="/admin" className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
      <ArrowLeft className="size-4" /> Operations console
    </Link>
  );
}

function Checks({ checks, reasons }: { checks: CheckLine[]; reasons: string[] }) {
  if (!checks.length && !reasons.length) return <p className="text-[13px] text-muted">No automated checks recorded.</p>;
  return (
    <div className="space-y-3">
      {checks.length > 0 && (
        <ul className="space-y-1.5">
          {checks.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex items-start gap-2 text-[13px]">
              <StatusIcon status={c.status} className="mt-0.5" />
              <span>
                <span className="font-medium text-ink">{c.label}</span>
                {c.detail && <span className="text-ink-2">: {c.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {reasons.length > 0 && (
        <ul className="space-y-0.5 text-[13px] text-ink-2">
          {reasons.map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Photo({ url, alt }: { url: string | null; alt: string }) {
  if (!url)
    return (
      <div className="flex h-40 w-full items-center justify-center rounded-lg border border-dashed border-line-strong text-center text-xs text-muted">
        No photo link from the server
      </div>
    );
  return <AuthedImage src={url} alt={alt} className="h-48 w-full rounded-lg border border-line bg-sunken object-contain" />;
}

/** Note + two buttons. The note is required, like every other reviewer decision. */
function Decide({
  approveLabel,
  rejectLabel,
  onDecide,
  confirmApprove,
}: {
  approveLabel: string;
  rejectLabel: string;
  onDecide: (approve: boolean, note: string) => Promise<void>;
  confirmApprove?: string;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ok = note.trim().length >= 3;

  const run = async (approve: boolean) => {
    if (busy) return;
    if (approve && confirmApprove && !confirm(confirmApprove)) return;
    setBusy(approve ? "approve" : "reject");
    setErr(null);
    try {
      await onDecide(approve, note.trim());
      setNote("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 border-t border-line pt-4">
      <Field label="Reviewer note" hint="Saved to the audit log. If you reject, the customer sees this note, so say what they can do next.">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you checked and why you decided" />
      </Field>
      {err && (
        <div className="mt-3">
          <ErrorNote>{err}</ErrorNote>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" icon={<CircleCheck className="size-4" />} disabled={!ok || busy !== null} loading={busy === "approve"} onClick={() => run(true)}>
          {approveLabel}
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={<CircleX className="size-4" />}
          disabled={!ok || busy !== null}
          loading={busy === "reject"}
          onClick={() => run(false)}
        >
          {rejectLabel}
        </Button>
      </div>
    </div>
  );
}

function Decided({ by, at, note }: { by: string | null; at: number | null; note: string | null }) {
  if (!by && !at && !note) return null;
  return (
    <div className="mt-4 border-t border-line pt-3 text-[13px] text-ink-2">
      Decided{by ? ` by ${by}` : ""}
      {at ? ` ${timeAgo(at)}` : ""}.{note && <span className="mt-1 block rounded-lg bg-sunken px-3 py-2">“{note}”</span>}
    </div>
  );
}

function QueueShell({
  title,
  subtitle,
  error,
  loaded,
  tab,
  setTab,
  waiting,
  decided,
  children,
}: {
  title: string;
  subtitle: string;
  error: string | null;
  loaded: boolean;
  tab: "waiting" | "decided";
  setTab: (t: "waiting" | "decided") => void;
  waiting: number;
  decided: number;
  children: ReactNode;
}) {
  return (
    <div className="vw-in">
      <BackToOps />
      <PageHeader eyebrow="Internal · identity" title={title} subtitle={subtitle} />
      {error && !loaded ? (
        <ErrorNote>Couldn&apos;t load the queue: {error}</ErrorNote>
      ) : !loaded ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "waiting", label: "Waiting", count: waiting },
              { value: "decided", label: "Decided", count: decided },
            ]}
          />
          {children}
        </>
      )}
    </div>
  );
}

/* ---------- ID checks ---------- */

function KycCase({ item, toast }: { item: AdminKycItem; toast: ReturnType<typeof useToast> }) {
  const waiting = item.status === "pending" || item.status === "needs_review";
  const b = KYC_BADGE[item.status];
  const nameDiffers = item.nameOnDoc && item.userName && item.nameOnDoc.trim().toLowerCase() !== item.userName.trim().toLowerCase();
  return (
    <Card>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[260px_1fr]">
        <Photo url={item.imageUrl} alt={`${docLabel(item.docType)} photo`} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{item.userName ?? "Unknown customer"}</span>
            <Badge tone={b.tone}>{b.label}</Badge>
            <Badge>{idText(item)}</Badge>
            {item.market && <Badge>{item.market} rules</Badge>}
            {item.createdAt && <span className="text-xs text-muted">sent {timeAgo(item.createdAt)}</span>}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-x-8 text-[13px] sm:grid-cols-2">
            <KV k="Name on ID" v={<span className={cx(nameDiffers && "font-semibold text-warn-ink")}>{item.nameOnDoc ?? "Not read"}</span>} />
            <KV k="Name on account" v={item.userName ?? "Unknown"} />
            <KV k="Date of birth" v={item.dob ?? "Not read"} />
            <KV k="Checked by" v={item.provider ?? "Unknown"} />
            {item.userEmail && <KV k="Email" v={item.userEmail} />}
          </div>
          <div className="mt-3">
            <Checks checks={item.checks} reasons={item.reasons} />
          </div>
        </div>
      </div>
      {waiting ? (
        <Decide
          approveLabel="Mark verified"
          rejectLabel="Reject"
          onDecide={async (approve, note) => {
            await api.post(`${KYC_QUEUE}/${item.id}`, { decision: approve ? "verified" : "rejected", note });
            toast({ tone: "good", text: approve ? "ID marked verified. The customer can move money." : "ID rejected. The customer can send another." });
            refreshAll();
          }}
        />
      ) : (
        <Decided by={item.decidedBy} at={item.decidedAt} note={item.note} />
      )}
    </Card>
  );
}

export function KycQueuePage() {
  const toast = useToast();
  const { data, error } = useApi<unknown>(KYC_QUEUE, { interval: 20_000 });
  const [tab, setTab] = useState<"waiting" | "decided">("waiting");
  const items = readKycQueue(data);
  const waiting = items.filter((i) => i.status === "pending" || i.status === "needs_review");
  const decided = items.filter((i) => i.status === "verified" || i.status === "rejected");
  const shown = tab === "waiting" ? waiting : decided;

  return (
    <QueueShell
      title="ID checks"
      subtitle="IDs the automatic check couldn't confirm. Look at the photo and the checks, then decide."
      error={error}
      loaded={data !== undefined}
      tab={tab}
      setTab={setTab}
      waiting={waiting.length}
      decided={decided.length}
    >
      {shown.length === 0 ? (
        <Empty
          icon={<IdCard className="size-6" />}
          title={tab === "waiting" ? "No IDs waiting" : "Nothing decided yet"}
          body={tab === "waiting" ? "IDs the automatic check isn't sure about land here." : "Decided ID checks show here."}
        />
      ) : (
        <div className="space-y-3">
          {shown.map((i) => (
            <KycCase key={i.id} item={i} toast={toast} />
          ))}
        </div>
      )}
    </QueueShell>
  );
}

/* ---------- Account recovery ---------- */

function ClaimCase({ item, now, toast }: { item: AdminClaimItem; now: number; toast: ReturnType<typeof useToast> }) {
  const b = CLAIM_BADGE[item.status];
  const left = item.expiresAt ? Math.ceil((item.expiresAt - now) / (24 * 60 * 60 * 1000)) : null;
  return (
    <Card>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[260px_1fr]">
        <Photo url={item.imageUrl} alt={`${docLabel(item.docType)} photo`} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{item.userName ?? "Unknown account"}</span>
            <Badge tone={b.tone}>{b.label}</Badge>
            <Badge>{idText(item)}</Badge>
            {item.createdAt && <span className="text-xs text-muted">asked {timeAgo(item.createdAt)}</span>}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-x-8 text-[13px] sm:grid-cols-2">
            <KV k="New login" v={item.claimantEmail ?? "Unknown"} />
            <KV k="Email on account" v={item.accountEmail ?? "None"} />
            {item.createdAt && <KV k="Asked" v={fmtDate(item.createdAt, true)} />}
            {item.status === "pending" && left != null && (
              <KV
                k="Closes"
                v={<span className={cx(left <= 1 && "font-semibold text-bad-ink")}>{left <= 0 ? "Today" : `in ${left} day${left === 1 ? "" : "s"}`}</span>}
              />
            )}
          </div>
          <div className="mt-3">
            <Checks checks={item.checks} reasons={item.reasons} />
          </div>
          {item.signIns.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs font-medium text-muted">Logins on this account now</div>
              <ul className="space-y-1 text-[13px]">
                {item.signIns.map((si, i) => (
                  <li key={`${si.email}-${i}`} className="flex flex-wrap items-center gap-2">
                    <span className="text-ink">{si.email ?? "No email"}</span>
                    {si.provider && <span className="text-xs text-muted">{si.provider}</span>}
                    {si.status && <Badge tone={si.status === "active" ? "good" : si.status === "recovery_pending" ? "warn" : "neutral"}>{si.status.replace(/_/g, " ")}</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      {item.status === "pending" ? (
        <Decide
          approveLabel="Approve recovery"
          rejectLabel="Reject"
          confirmApprove={`Give ${item.claimantEmail ?? "this login"} full access to ${item.userName ?? "this account"}? The account's old logins will stop working.`}
          onDecide={async (approve, note) => {
            await api.post(`${RECOVERY_QUEUE}/${item.id}`, { decision: approve ? "approved" : "rejected", note });
            toast({ tone: "good", text: approve ? "Recovery approved. The new login has full access." : "Recovery rejected. The new login has no access." });
            refreshAll();
          }}
        />
      ) : (
        <Decided by={item.decidedBy} at={item.decidedAt} note={item.note} />
      )}
    </Card>
  );
}

export function RecoveryQueuePage() {
  const toast = useToast();
  const now = useNow(60_000);
  const { data, error } = useApi<unknown>(RECOVERY_QUEUE, { interval: 20_000 });
  const [tab, setTab] = useState<"waiting" | "decided">("waiting");
  const items = readClaimQueue(data);
  const waiting = items.filter((i) => i.status === "pending");
  const decided = items.filter((i) => i.status !== "pending");
  const shown = tab === "waiting" ? waiting : decided;

  return (
    <QueueShell
      title="Account recovery"
      subtitle="People asking to get back into an account with their ID. Approving gives the new login full access and turns off the old logins."
      error={error}
      loaded={data !== undefined}
      tab={tab}
      setTab={setTab}
      waiting={waiting.length}
      decided={decided.length}
    >
      {shown.length === 0 ? (
        <Empty
          icon={<UserRoundSearch className="size-6" />}
          title={tab === "waiting" ? "No recovery requests waiting" : "Nothing decided yet"}
          body={tab === "waiting" ? "Requests close by themselves after 7 days without a decision." : "Decided requests show here."}
        />
      ) : (
        <div className="space-y-3">
          {shown.map((i) => (
            <ClaimCase key={i.id} item={i} now={now} toast={toast} />
          ))}
        </div>
      )}
    </QueueShell>
  );
}

/* ---------- Links on the ops overview ---------- */

export function IdentityAdminLinks() {
  const { data: kyc } = useApi<unknown>(KYC_QUEUE);
  const { data: rec } = useApi<unknown>(RECOVERY_QUEUE);
  const kycWaiting = readKycQueue(kyc).filter((i) => i.status === "pending" || i.status === "needs_review").length;
  const recWaiting = readClaimQueue(rec).filter((i) => i.status === "pending").length;
  const count = (n: number) => (n > 0 ? <span className="rounded-full bg-accent-soft px-1.5 text-xs text-accent-ink tnum">{n}</span> : null);
  return (
    <>
      <LinkButton href="/admin/kyc" size="sm" icon={<IdCard className="size-4" />}>
        ID checks {count(kycWaiting)}
      </LinkButton>
      <LinkButton href="/admin/recovery" size="sm" icon={<UserRoundSearch className="size-4" />}>
        Account recovery {count(recWaiting)}
      </LinkButton>
    </>
  );
}
