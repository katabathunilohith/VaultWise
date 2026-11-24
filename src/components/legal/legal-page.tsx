import Link from "next/link";
import type { ReactNode } from "react";
import { Card, PageHeader } from "@/components/ui";
import { CONTACT_EMAIL, LAST_UPDATED } from "./config";

/**
 * legal: the layout of the public policy pages. Plain markup with no hooks, so it renders the same inside
 * the signed-in shell and in the public frame (public-frame.tsx).
 */

const LINKS = [
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of use" },
  { href: "/delete-account", label: "Delete your account" },
];

export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div className="vw-in mx-auto max-w-3xl">
      <PageHeader eyebrow={`Last updated ${LAST_UPDATED}`} title={title} subtitle={intro} />
      <div className="space-y-5">{children}</div>
      <nav aria-label="Legal" className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-[13px]">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="font-medium text-accent-ink hover:underline">
            {l.label}
          </Link>
        ))}
        <ContactLink className="text-muted hover:underline" />
      </nav>
    </div>
  );
}

export function LegalSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <Card as="section">
      <h2 id={id} className="mb-3 scroll-mt-20 text-[15px] font-semibold text-ink">
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-ink-2">{children}</div>
    </Card>
  );
}

export function Bullets({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}

/** A two-column table that stays readable on a phone. */
export function InfoTable({ head, rows }: { head: [string, string]; rows: [ReactNode, ReactNode][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-surface-2 text-ink">
          <tr>
            <th className="px-3 py-2 font-semibold">{head[0]}</th>
            <th className="px-3 py-2 font-semibold">{head[1]}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(([a, b], i) => (
            <tr key={i} className="align-top">
              <td className="w-2/5 px-3 py-2 font-medium text-ink">{a}</td>
              <td className="px-3 py-2">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContactLink({ className }: { className?: string }) {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className={className ?? "font-medium text-accent-ink hover:underline"}>
      {CONTACT_EMAIL}
    </a>
  );
}
