"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, KeyRound, MailCheck, ScanSearch, UserRoundPlus } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { Button, ErrorNote, Field, Input, Notice } from "@/components/ui";
import { AuthFrame } from "./frame";
import { IdForm, idFormData, type IdSubmission } from "./id-form";
import { createLogin, friendlyAuthError, signIn } from "./session";
import { docTypesFor, passwordOk, PASSWORD_RULE, readFind, type FindResult } from "./types";

type Mode = "sign-in" | "create" | "forgot" | "find" | "recover";

function Heading({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {sub && <p className="mt-1 text-sm text-ink-2">{sub}</p>}
    </div>
  );
}

function BackLink({ onClick, children = "Back to sign in" }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mb-5 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden /> {children}
    </button>
  );
}

function TextLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="font-medium text-accent-ink hover:underline">
      {children}
    </button>
  );
}

function EmailPasswordForm({
  kind,
  email,
  onEmail,
  submitLabel,
  belowPassword,
}: {
  kind: "sign-in" | "create";
  email: string;
  onEmail: (v: string) => void;
  submitLabel: string;
  belowPassword?: ReactNode;
}) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (kind === "create" && !passwordOk(password)) return setErr("Your password needs at least 8 characters, with a letter and a number.");
    setBusy(true);
    try {
      await (kind === "sign-in" ? signIn(email, password) : createLogin(email, password));
      // The session store notices the new user and the app opens on its own.
    } catch (e) {
      setErr(friendlyAuthError(e));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => onEmail(e.target.value)} autoComplete="email" required />
      </Field>
      <Field label="Password" hint={kind === "create" ? PASSWORD_RULE : undefined}>
        <div className="relative">
          <Input
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={kind === "sign-in" ? "current-password" : "new-password"}
            required
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-ink"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      {belowPassword}
      {err && <ErrorNote>{err}</ErrorNote>}
      <Button type="submit" size="lg" variant="brand" className="w-full" loading={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}

function ForgotPassword({ email, onEmail, back }: { email: string; onEmail: (v: string) => void; back: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<{ simulated: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await api.post<{ ok: boolean; simulated?: boolean }>("/api/v1/recovery/reset", { email: email.trim() });
      setSent({ simulated: !!r?.simulated });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vw-in">
      <BackLink onClick={back} />
      <Heading title="Reset your password" sub="We'll email you a link to choose a new one." />
      {sent ? (
        <div className="space-y-4">
          <Notice tone="good" icon={<MailCheck className="size-4" />} title="Check your inbox">
            If a login uses {email.trim() || "that email"}, we sent it a link. Open the link to choose a new password, then sign in here.
          </Notice>
          {sent.simulated && <Notice tone="info">Practice mode. No email was sent.</Notice>}
          <Button variant="secondary" className="w-full" onClick={back}>
            Back to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => onEmail(e.target.value)} autoComplete="email" required />
          </Field>
          {err && <ErrorNote>{err}</ErrorNote>}
          <Button type="submit" size="lg" variant="brand" className="w-full" loading={busy}>
            Send reset link
          </Button>
          <p className="text-center text-[13px] text-muted">Can&apos;t open that email any more? Go back and choose &quot;Recover with an ID&quot;.</p>
        </form>
      )}
    </div>
  );
}

function FindAccount({ back, toRecover }: { back: () => void; toRecover: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<FindResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ simulated: boolean } | null>(null);

  const find = async (s: IdSubmission) => {
    setErr(null);
    setBusy(true);
    try {
      setResult(readFind(await api.upload("/api/v1/recovery/find", idFormData(s))));
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 429 ? "You've tried too many times. Wait an hour, then try again." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async (findToken: string) => {
    setErr(null);
    setSending(true);
    try {
      const r = await api.post<{ ok: boolean; simulated?: boolean }>("/api/v1/recovery/reset", { findToken });
      setSent({ simulated: !!r?.simulated });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const again = () => {
    setResult(null);
    setSent(null);
    setErr(null);
    setAttempt((n) => n + 1);
  };

  return (
    <div className="vw-in">
      <BackLink onClick={back} />
      <Heading title="Find your account with an ID" sub="Use the ID you verified with us. We'll show part of the email on the account." />
      {!result ? (
        <IdForm
          key={attempt}
          docTypes={docTypesFor(null)}
          photo="or-number"
          submitLabel="Find my account"
          busy={busy}
          onSubmit={find}
          footer={err && <ErrorNote>{err}</ErrorNote>}
        />
      ) : !result.found ? (
        <div className="space-y-4">
          <Notice tone="warn" title="We couldn't find a verified account with this ID">
            Check the type of ID and the number, then try again. Only IDs we&apos;ve already verified can be found.
          </Notice>
          <Button className="w-full" onClick={again}>
            Try again
          </Button>
        </div>
      ) : sent ? (
        <div className="space-y-4">
          <Notice tone="good" icon={<MailCheck className="size-4" />} title="Check your inbox">
            We sent a reset link to {result.maskedEmail ?? "the email on the account"}. Open it to choose a new password, then sign in.
          </Notice>
          {sent.simulated && <Notice tone="info">Practice mode. No email was sent.</Notice>}
          <Button variant="secondary" className="w-full" onClick={back}>
            Back to sign in
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Notice tone="good" title="We found your account">
            {result.maskedEmail ? (
              <>
                Its email is <span className="font-semibold">{result.maskedEmail}</span>.
              </>
            ) : (
              "It doesn't have an email we can show."
            )}
          </Notice>
          {result.canReset && result.findToken ? (
            <Button className="w-full" icon={<KeyRound className="size-4" />} loading={sending} onClick={() => sendLink(result.findToken!)}>
              Send a reset link to this email
            </Button>
          ) : (
            <p className="text-sm text-ink-2">We can&apos;t send a reset link to this account. You can still recover it with your ID.</p>
          )}
          {err && <ErrorNote>{err}</ErrorNote>}
          <p className="text-center text-[13px] text-muted">
            Can&apos;t open that email any more? <TextLink onClick={toRecover}>Recover with an ID</TextLink>
          </p>
        </div>
      )}
    </div>
  );
}

function RecoverIntro({ email, onEmail, back }: { email: string; onEmail: (v: string) => void; back: () => void }) {
  const [step, setStep] = useState<"intro" | "create" | "sign-in">("intro");

  if (step !== "intro")
    return (
      <div className="vw-in">
        <BackLink onClick={() => setStep("intro")}>Back</BackLink>
        <Heading
          title={step === "create" ? "Make a new login" : "Sign in to your new login"}
          sub="Use an email you can open. Next, you'll add a photo of your ID."
        />
        <EmailPasswordForm
          key={step}
          kind={step}
          email={email}
          onEmail={onEmail}
          submitLabel={step === "create" ? "Make login and continue" : "Sign in and continue"}
        />
      </div>
    );

  const steps = [
    "Make a new login with an email you can open.",
    "Add a photo of the ID you verified with us.",
    "We tell the email on the account. A person checks your ID. Until then you can look around, but money can't move.",
    "Once a person approves, you're back in. Your old logins stop working.",
  ];
  return (
    <div className="vw-in">
      <BackLink onClick={back} />
      <Heading title="Recover your account with an ID" sub="For when you can't open the email on your account any more." />
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s} className="flex items-start gap-3 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">
              {i + 1}
            </span>
            <span className="pt-0.5 text-ink-2">{s}</span>
          </li>
        ))}
      </ol>
      <div className="mt-6 space-y-2">
        <Button size="lg" variant="brand" className="w-full" icon={<UserRoundPlus className="size-4" />} onClick={() => setStep("create")}>
          Make a new login
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setStep("sign-in")}>
          I already made one. Sign in
        </Button>
      </div>
    </div>
  );
}

/** What people see when sign-in is on and nobody is signed in. */
export function SignInScreen({ initialMode }: { initialMode: "sign-in" | "recover" }) {
  const router = useRouter();
  const path = usePathname();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");

  const go = (m: Mode) => {
    setMode(m);
    // Recovery lives at /recover so it picks up again after the new login is made.
    if (m === "recover" && !path.startsWith("/recover")) router.replace("/recover");
    if (m !== "recover" && path.startsWith("/recover")) router.replace("/");
  };

  let body: ReactNode;
  if (mode === "forgot") body = <ForgotPassword email={email} onEmail={setEmail} back={() => go("sign-in")} />;
  else if (mode === "find") body = <FindAccount back={() => go("sign-in")} toRecover={() => go("recover")} />;
  else if (mode === "recover") body = <RecoverIntro email={email} onEmail={setEmail} back={() => go("sign-in")} />;
  else
    body = (
      <div className="vw-in">
        <Heading
          title={mode === "sign-in" ? "Sign in" : "Create your login"}
          sub={mode === "sign-in" ? "Use the email and password you signed up with." : "Use an email you can open. You'll set up your wallet next."}
        />
        <EmailPasswordForm
          key={mode}
          kind={mode}
          email={email}
          onEmail={setEmail}
          submitLabel={mode === "sign-in" ? "Sign in" : "Create login"}
          belowPassword={
            mode === "sign-in" && (
              <div className="-mt-1 text-right text-[13px]">
                <TextLink onClick={() => go("forgot")}>Forgot password?</TextLink>
              </div>
            )
          }
        />
        <p className="mt-5 text-center text-[13px] text-muted">
          {mode === "sign-in" ? (
            <>
              New here? <TextLink onClick={() => go("create")}>Create a login</TextLink>
            </>
          ) : (
            <>
              Already have a login? <TextLink onClick={() => go("sign-in")}>Sign in</TextLink>
            </>
          )}
        </p>
        {mode === "sign-in" && (
          <div className="mt-8 border-t border-line pt-5">
            <div className="mb-3 text-[13px] font-medium text-ink-2">Can&apos;t get in?</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button variant="secondary" icon={<ScanSearch className="size-4" />} onClick={() => go("find")}>
                Find my account with an ID
              </Button>
              <Button variant="secondary" icon={<UserRoundPlus className="size-4" />} onClick={() => go("recover")}>
                Recover with an ID
              </Button>
            </div>
          </div>
        )}
      </div>
    );

  return <AuthFrame>{body}</AuthFrame>;
}

/** The /sign-in route. The gate shows the sign-in screen while signed out, so this only renders once signed in. */
export function SignInRoute() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return <p className="text-sm text-muted">Taking you to your overview.</p>;
}
