"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, Clock, Hourglass, ShieldCheck } from "lucide-react";
import { api, clearApiCache, refreshAll, useApi, useNow } from "@/lib/client";
import { fmtDate } from "@/lib/shared";
import { useMe } from "@/components/shell";
import { Button, Card, CardTitle, Empty, KV, LinkButton, Notice, PageHeader, Skeleton, cx, useToast } from "@/components/ui";
import { CLAIM_URL } from "./claim-form";
import { SignOutButton } from "./frame";
import { useSession } from "./session";
import { docLabel, endingIn, readClaim, type ClaimView } from "./types";

function daysLeft(until: number | null, now: number) {
  if (!until) return null;
  return Math.max(0, Math.ceil((until - now) / (24 * 60 * 60 * 1000)));
}

/* ---------- Inside the app: claim status ---------- */

function Timeline({ claim }: { claim: ClaimView }) {
  const decided = claim.status === "approved" || claim.status === "rejected";
  const steps = [
    { label: "We got your ID", done: true },
    { label: claim.notifiedEmail ? `We told ${claim.notifiedEmail}, the email on the account` : "We told the account's owner", done: true },
    { label: "A person checks it's you", done: decided, active: claim.status === "pending" },
    { label: claim.status === "rejected" ? "Not approved" : "You get full access", done: claim.status === "approved", bad: claim.status === "rejected" },
  ];
  return (
    <ol className="space-y-3">
      {steps.map((s) => (
        <li key={s.label} className={cx("flex items-center gap-3 text-sm", s.done || s.active || s.bad ? "text-ink" : "text-muted")}>
          {s.bad ? (
            <CircleX className="size-5 text-bad" aria-hidden />
          ) : s.done ? (
            <CircleCheck className="size-5 text-good" aria-hidden />
          ) : s.active ? (
            <Hourglass className="size-5 text-accent" aria-hidden />
          ) : (
            <span className="size-5 rounded-full border-2 border-line-strong" aria-hidden />
          )}
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function ClaimStatusPage() {
  const me = useMe();
  const router = useRouter();
  const toast = useToast();
  const now = useNow(60_000);
  const inRecovery = me.auth?.access === "recovery";
  const { data, error, reload } = useApi<unknown>(CLAIM_URL);
  const claim = readClaim(data);
  const [busy, setBusy] = useState(false);
  const pending = claim?.status === "pending";

  // Look again every 20 seconds, but only while a person still has to decide.
  useEffect(() => {
    if (!inRecovery || !pending) return;
    const id = setInterval(reload, 20_000);
    return () => clearInterval(id);
  }, [inRecovery, pending, reload]);

  // Once the claim is decided (approved, rejected, expired or cancelled), reload /me: full access comes back,
  // or the login loses the account and the shell shows the outcome.
  const settled = !!claim && !pending;
  const reloadMe = me.reload;
  useEffect(() => {
    if (settled && inRecovery) reloadMe();
  }, [settled, inRecovery, reloadMe]);

  const cancel = async () => {
    if (!confirm("Cancel this request? This login will lose its access to the account.")) return;
    setBusy(true);
    try {
      await api.del(CLAIM_URL);
      toast({ tone: "info", text: "Request cancelled." });
      clearApiCache();
      refreshAll();
      router.push("/");
    } catch (e) {
      toast({ tone: "bad", text: (e as Error).message });
      setBusy(false);
    }
  };

  if (!data && !error)
    return (
      <div>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-6 h-72" />
      </div>
    );

  if (!claim || (!inRecovery && claim.status !== "approved"))
    return (
      <div className="vw-in">
        <PageHeader eyebrow="Account recovery" title="Nothing to recover" />
        <Empty
          icon={<ShieldCheck className="size-6" />}
          title="Your account is active"
          body="You have full access. There's no recovery request for this login."
          action={<LinkButton href="/">Go to overview</LinkButton>}
        />
      </div>
    );

  const left = daysLeft(claim.expiresAt, now);
  return (
    <div className="vw-in">
      <PageHeader
        eyebrow="Account recovery"
        title={claim.status === "approved" ? "You're back in" : claim.status === "pending" ? "We're checking it's you" : "Recovery request"}
        subtitle={
          claim.status === "approved"
            ? "Your account is yours again. Your old logins no longer work."
            : "You can see your overview and your vaults. Everything else, and moving money, opens once a person confirms it's you."
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardTitle sub="This page updates by itself.">Where it&apos;s at</CardTitle>
          <Timeline claim={claim} />
          {claim.status === "approved" && (
            <div className="mt-5">
              <LinkButton href="/" variant="primary">
                Go to overview
              </LinkButton>
            </div>
          )}
        </Card>
        <Card>
          <CardTitle>Your request</CardTitle>
          <div className="divide-y divide-line text-[13px]">
            <KV k="Sent" v={claim.createdAt ? fmtDate(claim.createdAt, true) : "Just now"} />
            <KV k="ID used" v={`${docLabel(claim.docType)} ${endingIn(claim.idLast4)}`.trim()} />
            {claim.status === "pending" && left != null && (
              <KV
                k="Decision by"
                v={
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden /> {left === 0 ? "Today" : `${left} day${left === 1 ? "" : "s"}`}
                  </span>
                }
              />
            )}
          </div>
          {claim.status === "pending" && (
            <>
              <p className="mt-4 text-xs text-muted">If nobody decides within 7 days, the request closes and this login loses access.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" loading={busy} onClick={cancel}>
                  Cancel request
                </Button>
                <SignOutButton variant="ghost" />
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

/** The /recover route inside the app. (Signed out, or signed in with no wallet, the gate shows its own screens instead.) */
export function RecoverRoute() {
  const session = useSession();
  if (session.status === "off")
    return (
      <div className="vw-in">
        <PageHeader eyebrow="Account recovery" title="Recovery needs sign-in" />
        <Notice tone="info" title="Sign-in is off in this prototype">
          Recovering an account with an ID needs sign-in. Without it, this browser always opens the one demo account.{" "}
          <Link href="/" className="font-medium underline">
            Go to overview
          </Link>
        </Notice>
      </div>
    );
  return <ClaimStatusPage />;
}
