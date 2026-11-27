import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui";
import { Bullets, ContactLink, LegalPage, LegalSection, OPERATOR } from "@/components/legal";

export const metadata: Metadata = {
  title: "Terms of use · Vaultwise",
  description: "The rules for using Vaultwise, a student capstone prototype that runs on pretend money.",
};

const linkClass = "font-medium text-accent-ink hover:underline";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro="The rules for using Vaultwise. By using the app or the website you agree to them, so please read them. They're short."
    >
      <Notice tone="warn" title="No real money, no real financial services">
        Vaultwise is a student prototype. All money in it is pretend. You can&apos;t deposit, withdraw, pay, earn or invest real money, and nothing in
        Vaultwise is a bank account, a payment service, an investment or financial advice.
      </Notice>

      <LegalSection id="what" title="1. What Vaultwise is">
        <p>
          Vaultwise is a capstone project built by {OPERATOR} in India to test an idea: savings &ldquo;vaults&rdquo; locked to a purpose, released
          when you show a bill or receipt, with emergency access when you need it. Its payout planner also works out, from figures you enter,
          whether your money lasts until your next allowance or pay. It is offered free, for testing and learning, for as long as the
          project runs.
        </p>
        <p>
          Balances, deposits, transfers, payments, investments and returns are simulated. ID checks are run by the team and an AI model as a
          demonstration, not by a licensed company, and passing one doesn&apos;t verify you for any real service.
        </p>
      </LegalSection>

      <LegalSection id="who" title="2. Who can use it">
        <Bullets>
          <li>You must be 18 or older.</li>
          <li>You must give your own, true details, and only upload your own ID and your own bills.</li>
          <li>One account per person.</li>
        </Bullets>
      </LegalSection>

      <LegalSection id="account" title="3. Your account">
        <Bullets>
          <li>Keep your password and PIN to yourself. Anything done with them is treated as done by you.</li>
          <li>Tell us straight away at <ContactLink /> if you think someone else has used your account.</li>
          <li>
            You can close your account at any time. See{" "}
            <Link href="/delete-account" className={linkClass}>
              how to delete your account
            </Link>
            .
          </li>
        </Bullets>
      </LegalSection>

      <LegalSection id="rules" title="4. Fair use">
        <p>Please don&apos;t:</p>
        <Bullets>
          <li>upload someone else&apos;s ID or bills, or edited, fake or reused documents;</li>
          <li>try to get into other people&apos;s accounts, or get round PINs, limits or checks;</li>
          <li>attack, overload, scrape or reverse-engineer the service, or use it to break the law;</li>
          <li>upload anything harmful, such as malware, or content that is illegal or abusive.</li>
        </Bullets>
        <p>We may suspend or close an account that breaks these rules.</p>
      </LegalSection>

      <LegalSection id="content" title="5. What you upload">
        <p>
          Your photos and details stay yours. You let us store and process them only to run Vaultwise as described in the{" "}
          <Link href="/privacy" className={linkClass}>
            privacy policy
          </Link>
          , including sending a photo to an AI service to read it if you agree to that.
        </p>
      </LegalSection>

      <LegalSection id="advice" title="6. Not advice">
        <p>
          Investing screens, market prices, portfolio ideas, tips and the AI assistant are for learning only. Prices may be delayed or wrong, and
          the AI can make mistakes. None of it is financial, tax or legal advice, and nobody in the team is a licensed adviser. Talk to a qualified
          professional before you make real decisions about money.
        </p>
      </LegalSection>

      <LegalSection id="availability" title="7. A prototype can break">
        <p>
          We&apos;re students testing an idea, so Vaultwise may change, go offline, lose data or be reset without notice, and features may be added
          or taken away. When the project ends we&apos;ll shut the service down and delete personal data as the privacy policy says. Please
          don&apos;t rely on it for anything important.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="8. Our responsibility">
        <p>
          Vaultwise is provided &ldquo;as is&rdquo;, free of charge, without promises that it will be available, accurate or free of errors. As far
          as the law allows, we aren&apos;t responsible for any loss that comes from using it, and because no real money is involved, no real money
          can be lost through it. Nothing in these terms limits a responsibility that Indian law doesn&apos;t allow us to limit, or your rights
          under the Digital Personal Data Protection Act, 2023.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="9. Changes and ending">
        <p>
          We may update these terms. We&apos;ll change the date at the top of this page, and tell you in the app about changes that matter. If you
          keep using Vaultwise after a change, the new terms apply; if you don&apos;t agree, close your account. You can stop using Vaultwise at any
          time.
        </p>
      </LegalSection>

      <LegalSection id="law" title="10. Law and contact">
        <p>
          These terms are governed by the laws of India. If something goes wrong, please write to us first at <ContactLink /> and we&apos;ll try to
          sort it out.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
