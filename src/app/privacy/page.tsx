import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui";
import {
  BACKUP_DAYS,
  Bullets,
  CLOSED_ACCOUNT_DAYS,
  ContactLink,
  InfoTable,
  LegalPage,
  LegalSection,
  OPERATOR,
  REPLY_DAYS,
} from "@/components/legal";

export const metadata: Metadata = {
  title: "Privacy policy · Vaultwise",
  description: "What Vaultwise collects, why, who receives it, how long it's kept, and your rights under India's DPDP Act 2023.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="What we collect, why we need it, who else sees it, how long we keep it, and how to get it changed or deleted. Written in plain English."
    >
      <Notice tone="warn" title="Vaultwise is a student prototype. The money is pretend.">
        Vaultwise is a capstone project built by {OPERATOR} in India. Every balance, deposit, payment and investment is simulated
        (&ldquo;Practice&rdquo; or pretend money). We don&apos;t hold real money, move real money or offer any real financial service, and no
        licensed company checks your ID.
      </Notice>

      <LegalSection id="who" title="Who we are">
        <p>
          Vaultwise is run by {OPERATOR} as a university capstone project. For this policy we are the &ldquo;Data Fiduciary&rdquo; under
          India&apos;s Digital Personal Data Protection Act, 2023 (DPDP Act): we decide what personal data is collected and why. You can reach us
          about anything in this policy at <ContactLink />.
        </p>
      </LegalSection>

      <LegalSection id="collect" title="What we collect, and why">
        <p>We only collect what the app needs to work. Which parts apply depends on what you use.</p>
        <InfoTable
          head={["What", "Why we need it"]}
          rows={[
            ["Name and email address", "To create your account, sign you in, and contact you about it."],
            ["Phone number, if you add one", "To send sign-in codes and alerts about your account."],
            ["Country", "To apply that country's currency, limits and rules."],
            [
              "Your PIN, stored only as a scrambled hash",
              "To confirm it's you before money moves. We can't read your PIN back; we can only check a PIN you type against the hash.",
            ],
            [
              "ID details: the last 4 characters of the ID number, a keyed hash of the full number, and the name and date of birth printed on it",
              "To check you are who you say you are, to stop one person opening many accounts, and to help you get back into your account. We never store the full ID number.",
            ],
            [
              "Photos of your ID and of bills or receipts",
              "An ID photo to check your identity; bill and receipt photos to confirm that money taken out of a vault was spent on what the vault is for. We also read the photo's basic file details (such as when it was taken) to spot edited or reused images.",
            ],
            [
              "A device ID (a random number made when you install the app) and your IP address",
              "To recognise your phone, stop people guessing their way into accounts, and limit abuse. IP addresses used for limits are stored only as a hash.",
            ],
            [
              "What you do in the app",
              "Your vaults, goals and rules, pretend-money movements, emergency requests, investing questionnaire answers, and a tamper-evident activity log. The app needs these to work, and the log lets us show exactly what happened and when.",
            ],
          ]}
        />
        <p>
          We don&apos;t collect your contacts, location, real bank or card details, or anything from other apps. We don&apos;t sell personal
          data, and we don&apos;t use it for advertising.
        </p>
      </LegalSection>

      <LegalSection id="practice" title="If you use Practice only">
        <p>
          The store and shareable test builds of the app run on Practice: pretend money kept on your phone. In Practice your vaults and activity
          stay on your phone and nothing about them is sent to our server. Deleting the app, or using <em>Settings → Delete account</em>, removes
          it.
        </p>
      </LegalSection>

      <LegalSection id="share" title="Who receives your data">
        <InfoTable
          head={["Who", "What they get, and when"]}
          rows={[
            [
              "The Vaultwise server",
              "Everything in the table above, if you use a signed-in (non-Practice) build or the website. It runs on Amazon Web Services in Mumbai, India, on an encrypted disk.",
            ],
            [
              "Google Firebase (sign-in)",
              "Your email address, a scrambled form of your password, and sign-in records, so you can sign in and reset your password. Google may process this outside India.",
            ],
            [
              "Groq (AI reading), only if you agree",
              "When you say yes to AI help, the photo of a bill or ID is sent to Groq's AI service to read the text on it, and questions you ask the assistant are sent with a short summary of your vaults. If you say no, a person on our team reads your photos instead and nothing goes to Groq. Groq is based in the United States.",
            ],
            [
              "PostHog (usage statistics), test build only, only if you opt in",
              "In the public test link only, and only after you tap \"Yes, share\": a random ID, your device type, which screens you open and which test steps you finish, plus any feedback form you choose to send. Never your name, amounts or anything you type. We ask PostHog to discard IP addresses.",
            ],
            [
              "Our team",
              "Team members who review bills and IDs, or answer your questions, can see the data needed for that task.",
            ],
          ]}
        />
        <p>
          We may share data if the law requires it, for example a valid request from a court or government authority. We don&apos;t share it with
          anyone else.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="How long we keep it">
        <Bullets>
          <li>While your account is open, we keep what the app needs to work.</li>
          <li>A rejected ID photo is deleted straight away. We keep only the last 4 characters and the result of the check.</li>
          <li>
            When you close your account it stops working at once. We keep its records for up to {CLOSED_ACCOUNT_DAYS} days, so we can answer
            questions and keep the activity log complete, and then delete them, including your photos and your sign-in at Firebase.
          </li>
          <li>Backups are kept for {BACKUP_DAYS} days, so deleted data disappears from them within {BACKUP_DAYS} days.</li>
          <li>When the project ends, we delete all personal data and shut the server down.</li>
        </Bullets>
      </LegalSection>

      <LegalSection id="security" title="How we protect it">
        <Bullets>
          <li>All traffic to Vaultwise is encrypted (HTTPS), and the server&apos;s disk is encrypted.</li>
          <li>PINs are stored as salted hashes, and ID numbers as the last 4 characters plus a keyed hash, never in full.</li>
          <li>Your account&apos;s data can only be reached by signing in to it, and only named team members can open the review console.</li>
          <li>Money moves and decisions are written to a tamper-evident log.</li>
          <li>We limit repeated attempts at PINs and account recovery, and we never write ID numbers, PINs or passwords to our logs.</li>
        </Bullets>
        <p>
          No system is perfectly secure. This is a student project, not a bank, so please don&apos;t upload anything you aren&apos;t comfortable
          sharing with a prototype. If we learn of a breach that affects you, we&apos;ll tell you and the Data Protection Board of India as the DPDP
          Act requires.
        </p>
      </LegalSection>

      <LegalSection id="rights" title="Your rights">
        <p>Under the DPDP Act you can:</p>
        <Bullets>
          <li>
            <strong className="text-ink">Access</strong> a summary of your personal data and who we&apos;ve shared it with. On the website, use{" "}
            <em>Settings &amp; privacy → Download all my data</em>, or email us.
          </li>
          <li>
            <strong className="text-ink">Correct or update</strong> data that is wrong or out of date. Most of it you can change in Settings; email
            us for the rest.
          </li>
          <li>
            <strong className="text-ink">Erase</strong> your data. Close your account (see{" "}
            <Link href="/delete-account" className="font-medium text-accent-ink hover:underline">
              how to delete your account
            </Link>
            ), or email us to have it deleted sooner.
          </li>
          <li>
            <strong className="text-ink">Withdraw consent</strong> at any time, for example to AI reading, which you can turn off in the app. It
            doesn&apos;t undo what happened before you withdrew it.
          </li>
          <li>
            <strong className="text-ink">Nominate</strong> someone to use these rights for you if you die or can&apos;t act for yourself.
          </li>
          <li>
            <strong className="text-ink">Complain</strong> to us first (see below). If you aren&apos;t happy with our answer, you can complain to the
            Data Protection Board of India.
          </li>
        </Bullets>
        <p>We&apos;ll reply to any request within {REPLY_DAYS} days. We may ask you to confirm it&apos;s really you first.</p>
      </LegalSection>

      <LegalSection id="children" title="Children">
        <p>
          Vaultwise is for people aged 18 and over. We don&apos;t knowingly collect data from anyone younger. If you think a child has given us
          their data, email us and we&apos;ll delete it.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to this policy">
        <p>
          If we change this policy we&apos;ll update the date at the top of this page, and tell you in the app if the change matters to you. If a
          change needs your consent, we&apos;ll ask for it first.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact and complaints">
        <p>
          For questions, requests or complaints about your data, email our grievance contact at <ContactLink />. Please write from the email
          address on your account, so we can find it.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
