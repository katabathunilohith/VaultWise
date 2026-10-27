"use client";

/**
 * identity: the sign-in gate for the customer shell (src/components/shell.tsx).
 * With sign-in off (no NEXT_PUBLIC_FIREBASE_* settings) the gate passes everything through, so the app
 * behaves exactly as before. This file must not import src/components/shell.tsx (shell imports it).
 */
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Hourglass, IdCard, ShieldAlert } from "lucide-react";
import { clearApiCache, useApi } from "@/lib/client";
import { Button, LinkButton, Modal, Notice } from "@/components/ui";
import { CLAIM_URL, RecoverClaimScreen } from "./claim-form";
import { ME_URL, RECOVERY_PAGES } from "./config";
import { AuthFrame, OpsFrame, SignOutButton } from "./frame";
import { SignInScreen } from "./sign-in";
import { dismissApiNotice, errorCodeFor, signOutNow, useApiNotice, useSession } from "./session";
import { kycStatusOf, readClaim, type IdentityMe } from "./types";

type GateMe = IdentityMe & { onboarded: boolean; user?: { kycStatus?: string } };

function SetupNeeded() {
  return (
    <AuthFrame>
      <Notice tone="warn" title="Sign-in is on at the server, but not in this web app">
        Add the NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_APP_ID
        settings for the same Firebase project, then restart the web app.
      </Notice>
    </AuthFrame>
  );
}

function SignInUnavailable({ message }: { message: string }) {
  return (
    <AuthFrame>
      <div className="space-y-4">
        <Notice tone="bad" title="Sign-in couldn't start">
          Check your connection, then reload the page. ({message})
        </Notice>
        <Button className="w-full" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </AuthFrame>
  );
}

function SignInAgain() {
  return (
    <AuthFrame>
      <div className="space-y-4">
        <Notice tone="warn" title="Please sign in again">
          We couldn&apos;t confirm your sign-in. This happens when a login was turned off or the app was set up again.
        </Notice>
        <SignOutButton size="md" />
      </div>
    </AuthFrame>
  );
}

/**
 * Decides what the shell shows. `meUrl` is null until sign-in state is known (and while signed out), so
 * no request goes out without a token. `screen()` returns a full-screen view, or null to carry on as before.
 */
export function useIdentityGate() {
  const session = useSession();
  const path = usePathname();
  const uid = session.status === "signed_in" ? session.uid : null;

  // Someone else signed in, or the person signed out: forget everything cached for the last login.
  const lastUid = useRef(uid);
  useEffect(() => {
    if (lastUid.current === uid) return;
    lastUid.current = uid;
    clearApiCache();
  }, [uid]);

  const meUrl = session.status === "off" || session.status === "signed_in" ? ME_URL : null;

  // Signed in with no wallet: is there a claim still waiting for a person? (It may leave the login with no
  // access at all until someone approves.) Then the waiting screen shows on every page, not onboarding.
  const { data: meNow } = useApi<GateMe>(meUrl);
  const noWallet = session.status === "signed_in" && meNow?.onboarded === false;
  const { data: claimData } = useApi<unknown>(noWallet ? CLAIM_URL : null);
  const claimWaiting = noWallet && (readClaim(claimData)?.status === "pending" || meNow?.recovery?.status === "pending");

  const screen = ({ me, error, page }: { me: GateMe | undefined; error: string | null; page: ReactNode }): ReactNode => {
    if (session.status === "off") return error && !me && errorCodeFor(ME_URL) === "signed_out" ? <SetupNeeded /> : null;
    if (session.status === "loading") return null;
    if (session.status === "unavailable") return <SignInUnavailable message={session.message} />;
    if (session.status === "signed_out") return <SignInScreen initialMode={path.startsWith("/recover") ? "recover" : "sign-in"} />;
    if (!me) return error && errorCodeFor(ME_URL) === "signed_out" ? <SignInAgain /> : null;
    if (!me.onboarded) {
      if (path.startsWith("/admin")) return <OpsFrame>{page}</OpsFrame>;
      if (path.startsWith("/recover") || claimWaiting) return <RecoverClaimScreen />;
    }
    return null;
  };

  return { meUrl, screen };
}

/** Explains kyc_required / recovery_restricted / signed_out answers from any request, with a way forward. */
function ApiNoticeDialog() {
  const notice = useApiNotice();
  const router = useRouter();
  const goTo = (href: string) => {
    dismissApiNotice();
    router.push(href);
  };
  if (notice === "kyc_required")
    return (
      <Modal
        open
        onClose={dismissApiNotice}
        title="Verify your ID first"
        footer={
          <>
            <Button variant="ghost" onClick={dismissApiNotice}>
              Not now
            </Button>
            <Button icon={<IdCard className="size-4" />} onClick={() => goTo("/verify")}>
              Verify my ID
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">You need a verified ID to move money. It takes a minute, and you only do it once.</p>
      </Modal>
    );
  if (notice === "recovery_restricted")
    return (
      <Modal
        open
        onClose={dismissApiNotice}
        title="Your account is being checked"
        footer={
          <>
            <Button variant="ghost" onClick={dismissApiNotice}>
              OK
            </Button>
            <Button onClick={() => goTo("/recover")}>See status</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Money can&apos;t move until a person confirms it&apos;s you. You can still look around.</p>
      </Modal>
    );
  if (notice === "signed_out")
    return (
      <Modal
        open
        onClose={dismissApiNotice}
        title="Please sign in again"
        footer={
          <Button
            onClick={async () => {
              dismissApiNotice();
              await signOutNow();
              clearApiCache();
            }}
          >
            Sign in again
          </Button>
        }
      >
        <p className="text-sm text-ink-2">Your sign-in has ended. Sign in again to carry on.</p>
      </Modal>
    );
  return null;
}

/** True when `path` stays open during a recovery check (see RECOVERY_PAGES in config.ts). */
function openDuringRecovery(path: string) {
  if (path.startsWith("/admin") || path.startsWith("/recover")) return true;
  return RECOVERY_PAGES.includes(path);
}

/** Stands in for a page the server keeps closed while a person checks a recovery. */
function ClosedDuringRecovery() {
  return (
    <div className="vw-in flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      <Hourglass className="size-7 text-muted" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold">Available once a person confirms it&apos;s you</h1>
      <p className="mt-1 max-w-md text-sm text-ink-2">
        While we check your ID you can see your overview and your vaults. This page opens as soon as a person approves.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <LinkButton href="/recover" variant="primary">
          See status
        </LinkButton>
        <LinkButton href="/">Go to overview</LinkButton>
        <SignOutButton size="md" variant="ghost" />
      </div>
    </div>
  );
}

/**
 * The customer page area: banners on top, then the page. During a recovery check, pages the server keeps
 * closed show a calm placeholder instead of their own errors.
 */
export function IdentityMain({ me, children }: { me: GateMe; children: ReactNode }) {
  const path = usePathname();
  const closed = me.auth?.access === "recovery" && !openDuringRecovery(path);
  return (
    <>
      <IdentityBanners me={me} />
      {closed ? <ClosedDuringRecovery /> : children}
    </>
  );
}

/** Banners at the top of every customer page: account being recovered, or ID not verified yet. */
export function IdentityBanners({ me }: { me: GateMe }) {
  const path = usePathname();
  const status = kycStatusOf(me);
  const recovering = me.auth?.access === "recovery";
  const onOps = path.startsWith("/admin");

  let banner: ReactNode = null;
  if (recovering && !path.startsWith("/recover"))
    banner = (
      <Notice
        tone="warn"
        icon={<ShieldAlert className="size-4" />}
        title="Your account is being checked"
        action={
          <LinkButton href="/recover" size="sm">
            See status
          </LinkButton>
        }
      >
        You can see your overview and your vaults. Everything else, and moving money, opens once a person confirms it&apos;s you.
      </Notice>
    );
  else if (!recovering && !onOps && status !== "verified" && !path.startsWith("/verify"))
    banner =
      status === "pending" || status === "needs_review" ? (
        <Notice
          tone="info"
          icon={<IdCard className="size-4" />}
          title="We're checking your ID"
          action={
            <LinkButton href="/verify" size="sm">
              See status
            </LinkButton>
          }
        >
          You can move money once it&apos;s verified.
        </Notice>
      ) : (
        <Notice
          tone="warn"
          icon={<IdCard className="size-4" />}
          title="Verify your ID to move money"
          action={
            <LinkButton href="/verify" size="sm" variant="primary">
              Verify my ID
            </LinkButton>
          }
        >
          {status === "rejected" ? "We couldn't verify the last ID you sent. Try again with a clearer photo." : "It takes a minute. Have your ID ready."}
        </Notice>
      );

  return (
    <>
      {banner && <div className="mb-5">{banner}</div>}
      <ApiNoticeDialog />
    </>
  );
}
