import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Settings } from "lucide-react";
import { LinkButton, Notice } from "@/components/ui";
import { SIGN_IN_ON } from "@/components/identity/config"; // identity: is web sign-in configured in this build?
import { BACKUP_DAYS, Bullets, CLOSED_ACCOUNT_DAYS, ContactLink, LegalPage, LegalSection, REPLY_DAYS } from "@/components/legal";

export const metadata: Metadata = {
  title: "Delete your account · Vaultwise",
  description: "How to close your Vaultwise account in the app or on the web, and what happens to your data.",
};

const linkClass = "font-medium text-accent-ink hover:underline";

function Steps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5">{children}</ol>;
}

export default function DeleteAccountPage() {
  return (
    <LegalPage title="Delete your account" intro="You can close your Vaultwise account at any time, in the app or on this website. Here's how, and what happens to your data.">
      <LegalSection id="app" title="In the app">
        <Steps>
          <li>Tap your profile picture at the top of the screen to open Settings.</li>
          <li>
            Tap <strong className="text-ink">Delete account</strong>.
          </li>
          <li>Check the summary, enter your PIN, then press and hold the button to confirm.</li>
        </Steps>
        <p>
          If you use Practice (pretend money kept on your phone), this resets the Practice data on your phone. Nothing from Practice is stored on
          our server. Deleting the app removes it too.
        </p>
      </LegalSection>

      <LegalSection id="web" title="On the website">
        {SIGN_IN_ON ? (
          <>
            <Steps>
              <li>Sign in on this website with the same email address you use in the app.</li>
              <li>
                Open <strong className="text-ink">Settings &amp; privacy</strong>.
              </li>
              <li>
                Under <strong className="text-ink">System</strong>, choose <strong className="text-ink">Close account</strong> and confirm.
              </li>
            </Steps>
            <div>
              <LinkButton href="/settings" variant="primary" icon={<Settings className="size-4" aria-hidden />}>
                Go to Settings
              </LinkButton>
            </div>
          </>
        ) : (
          <Notice tone="warn" title="Web sign-in isn't set up on this server yet">
            So accounts can&apos;t be closed on this website for now. Use the app, or email us as described below and we&apos;ll close it for you.
          </Notice>
        )}
      </LegalSection>

      <LegalSection id="email" title="Can't sign in?">
        <p>
          Email <ContactLink /> from the email address on your account and ask us to delete it. We may ask you to confirm it&apos;s really you, then
          we&apos;ll delete the account within {REPLY_DAYS} days and let you know.
        </p>
      </LegalSection>

      <LegalSection id="what-happens" title="What happens to your data">
        <Bullets>
          <li>Your account stops working straight away, and you&apos;re signed out of it everywhere.</li>
          <li>All money in Vaultwise is pretend, so there is nothing to pay out and nothing is lost.</li>
          <li>
            We keep the account&apos;s records (your profile, pretend-money history, bill and ID photos and activity log) for up to{" "}
            {CLOSED_ACCOUNT_DAYS} days, so we can answer questions and keep the activity log complete. Then we delete them, along with your sign-in
            at Firebase.
          </li>
          <li>Backups are kept for {BACKUP_DAYS} days, so your data leaves them within {BACKUP_DAYS} days after that.</li>
          <li>
            Want it gone sooner, or only some of it deleted? Email <ContactLink />.
          </li>
        </Bullets>
        <p>
          More detail is in our{" "}
          <Link href="/privacy" className={linkClass}>
            privacy policy
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
