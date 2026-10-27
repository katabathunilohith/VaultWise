"use client";

import { useState } from "react";
import { IdCard, KeyRound } from "lucide-react";
import { useMe } from "@/components/shell";
import { Badge, Button, Card, CardTitle, KV, LinkButton, cx, useToast } from "@/components/ui";
import { SignOutButton } from "./frame";
import { KYC_COPY } from "./kyc";
import { friendlyAuthError, refreshSignIn, sendEmailCheck, useSession } from "./session";
import { docLabel, endingIn, kycStatusOf } from "./types";

function EmailCheck() {
  const toast = useToast();
  const [busy, setBusy] = useState<"send" | "check" | null>(null);
  const run = async (kind: "send" | "check") => {
    setBusy(kind);
    try {
      if (kind === "send") {
        await sendEmailCheck();
        toast({ tone: "good", text: "We sent the link again. Check your inbox." });
      } else {
        await refreshSignIn();
      }
    } catch (e) {
      toast({ tone: "bad", text: friendlyAuthError(e) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mt-3 rounded-lg bg-warn-soft px-3 py-2.5 text-[13px] text-warn-ink">
      Confirm your email with the link we sent. It helps keep your account safe.
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" loading={busy === "send"} onClick={() => run("send")}>
          Send link again
        </Button>
        <Button size="sm" variant="ghost" loading={busy === "check"} onClick={() => run("check")}>
          I&apos;ve confirmed it
        </Button>
      </div>
    </div>
  );
}

/** Settings card: who is signed in, sign out, and the ID check. */
export function IdentitySettingsCard({ className }: { className?: string }) {
  const me = useMe();
  const session = useSession();
  const status = kycStatusOf(me);
  const copy = KYC_COPY[status];
  const recovering = me.auth?.access === "recovery";
  const signedIn = session.status === "signed_in";

  return (
    <Card className={className}>
      <CardTitle sub={signedIn ? "Your login and your ID check" : "Your ID check"}>
        <span className="inline-flex items-center gap-2">
          <KeyRound className="size-4" /> Sign-in and ID
        </span>
      </CardTitle>
      <div className={cx("grid grid-cols-1 gap-6", signedIn && "md:grid-cols-2")}>
        {signedIn && (
          <div>
            <div className="divide-y divide-line text-[13px]">
              <KV k="Signed in as" v={session.email ?? me.auth?.email ?? "Unknown email"} />
              <KV k="Email" v={session.emailVerified ? <Badge tone="good">Confirmed</Badge> : <Badge tone="warn">Not confirmed</Badge>} />
              <KV k="Access" v={recovering ? <Badge tone="warn">Being checked</Badge> : <Badge tone="good">Full</Badge>} />
            </div>
            {!session.emailVerified && <EmailCheck />}
            <div className="mt-4 flex flex-wrap gap-2">
              <SignOutButton />
              {recovering && (
                <LinkButton href="/recover" size="sm">
                  See recovery status
                </LinkButton>
              )}
            </div>
          </div>
        )}
        <div>
          <div className="divide-y divide-line text-[13px]">
            <KV k="ID check" v={<Badge tone={copy.tone}>{copy.label}</Badge>} />
            {me.kyc?.docType && <KV k="ID on file" v={`${docLabel(me.kyc.docType)} ${endingIn(me.kyc.idLast4)}`.trim()} />}
          </div>
          <div className="mt-4">
            <LinkButton
              href="/verify"
              size="sm"
              variant={status === "verified" ? "secondary" : "primary"}
              icon={<IdCard className="size-3.5" />}
            >
              {status === "verified" ? "See ID check" : status === "pending" || status === "needs_review" ? "See status" : "Verify my ID"}
            </LinkButton>
          </div>
        </div>
      </div>
    </Card>
  );
}
