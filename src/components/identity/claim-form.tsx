"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Hourglass, LoaderCircle } from "lucide-react";
import { api, clearApiCache, refreshAll, useApi, useNow } from "@/lib/client";
import { fmtDate } from "@/lib/shared";
import { Button, ErrorNote, KV, Notice, Skeleton } from "@/components/ui";
import { AuthFrame, SignedInAs } from "./frame";
import { IdForm, idFormData, type IdSubmission } from "./id-form";
import { docLabel, docTypesFor, endingIn, readClaim, type ClaimView } from "./types";

export const CLAIM_URL = "/api/v1/recovery/claim";

const DAY = 24 * 60 * 60 * 1000;

/** A claim a person hasn't decided yet, while this login has no access to the account. */
function Waiting({ claim }: { claim: ClaimView }) {
  const now = useNow(60_000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const left = claim.expiresAt ? Math.max(0, Math.ceil((claim.expiresAt - now) / DAY)) : null;

  const cancel = async () => {
    if (!confirm("Cancel this request? You can send a new one later.")) return;
    setBusy(true);
    setErr(null);
    try {
      await api.del(CLAIM_URL);
      clearApiCache();
      refreshAll();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vw-in space-y-5">
      <div className="flex items-start gap-3">
        <Hourglass className="mt-1 size-6 shrink-0 text-accent" aria-hidden />
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">We&apos;re checking it&apos;s you</h2>
          <p className="mt-1 text-sm text-ink-2">
            {claim.access === "read_only"
              ? "A person is checking your ID. Until then you can see your overview and your vaults."
              : "A person is checking your ID. You can get into your account once they confirm it's you."}
          </p>
        </div>
      </div>
      <p className="text-[13px] text-muted">You don&apos;t need to do anything. This page updates by itself.</p>
      <div className="divide-y divide-line rounded-xl border border-line px-4 text-[13px]">
        <KV k="Sent" v={claim.createdAt ? fmtDate(claim.createdAt, true) : "Just now"} />
        <KV k="ID used" v={`${docLabel(claim.docType)} ${endingIn(claim.idLast4)}`.trim()} />
        {claim.notifiedEmail && <KV k="We told" v={claim.notifiedEmail} />}
        {left != null && <KV k="Decision by" v={left === 0 ? "Today" : `${left} day${left === 1 ? "" : "s"}`} />}
      </div>
      <p className="text-xs text-muted">If nobody decides within 7 days, the request closes.</p>
      {err && <ErrorNote>{err}</ErrorNote>}
      <Button variant="ghost" loading={busy} onClick={cancel}>
        Cancel request
      </Button>
    </div>
  );
}

/**
 * Shown to a signed-in login with no wallet: at /recover, or anywhere while its claim waits for a person.
 * Sends an ID to claim an existing account, then shows where the claim is at.
 */
export function RecoverClaimScreen() {
  const router = useRouter();
  const { data, loading, reload } = useApi<unknown>(CLAIM_URL);
  const claim = readClaim(data);
  const pending = claim?.status === "pending";
  const approved = claim?.status === "approved";
  // Read-only access already opens the overview and vaults: reload /me so the shell shows them.
  const opens = approved || (pending && claim?.access === "read_only");
  const [retry, setRetry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Look again every 20 seconds only while a person still has to decide.
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(reload, 20_000);
    return () => clearInterval(id);
  }, [pending, reload]);

  // Approved: this login now opens the account, so reload /me (the shell then shows the app).
  useEffect(() => {
    if (opens) refreshAll();
  }, [opens]);

  const submit = async (s: IdSubmission) => {
    setErr(null);
    setBusy(true);
    try {
      await api.upload(CLAIM_URL, idFormData(s));
      // With read-only access the shell opens the account; without it, this screen shows the waiting state.
      clearApiCache();
      refreshAll();
      setRetry(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const closed = claim && !pending && !approved && !retry;

  let body;
  if (!data && loading) body = <Skeleton className="h-80 w-full" />;
  else if (claim && pending) body = <Waiting claim={claim} />;
  else if (approved)
    body = (
      <div className="vw-in space-y-3">
        <CircleCheck className="size-7 text-good" aria-hidden />
        <h2 className="text-2xl font-semibold tracking-tight">You&apos;re back in</h2>
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Opening your account.
        </p>
      </div>
    );
  else if (closed)
    body = (
      <div className="vw-in space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">
          {claim.status === "rejected" ? "We couldn't confirm it's you" : claim.status === "cancelled" ? "You cancelled this request" : "This request closed"}
        </h2>
        {claim.status === "rejected" && (
          <Notice tone="bad" title="This request wasn't approved">
            {claim.reasons.length || claim.note ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {[...claim.reasons, ...(claim.note ? [claim.note] : [])].map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              "This login has no access to the account."
            )}
          </Notice>
        )}
        {claim.status === "expired" && <Notice tone="warn">Nobody decided within 7 days, so the request closed. This login has no access to the account.</Notice>}
        <div className="flex flex-col gap-2">
          <Button onClick={() => setRetry(true)}>Try again with another photo</Button>
          <Button variant="ghost" onClick={() => router.push("/")}>
            Open a new wallet instead
          </Button>
        </div>
      </div>
    );
  else
    body = (
      <div className="vw-in">
        <h2 className="text-2xl font-semibold tracking-tight">Show us your ID</h2>
        <p className="mt-1 mb-6 text-sm text-ink-2">Use the same ID you verified with us before. We match it to your account.</p>
        <IdForm
          docTypes={docTypesFor(null)}
          photo="required"
          submitLabel="Send for checking"
          busy={busy}
          onSubmit={submit}
          footer={
            <>
              {err && <ErrorNote>{err}</ErrorNote>}
              <p className="text-center text-[13px] text-muted">
                Don&apos;t have an account yet?{" "}
                <button type="button" onClick={() => router.push("/")} className="font-medium text-accent-ink hover:underline">
                  Open a new wallet
                </button>
              </p>
            </>
          }
        />
      </div>
    );

  return (
    <AuthFrame
      top={<SignedInAs />}
      aside={
        <>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">Getting you back in</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-brand-muted">
            A person checks every recovery. We also tell the email on the account, so the owner knows. Until a person approves, money can&apos;t move.
          </p>
        </>
      }
    >
      {body}
    </AuthFrame>
  );
}
