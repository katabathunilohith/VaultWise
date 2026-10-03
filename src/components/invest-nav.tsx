"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const LINKS = [
  { href: "/invest", label: "Overview" },
  { href: "/invest/core", label: "Core sleeve" },
  { href: "/invest/satellite", label: "Satellite sleeve" },
  { href: "/invest/profile", label: "Risk profile" },
];

export function InvestNav() {
  const path = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Invest">
      {LINKS.map((l) => {
        const active = l.href === "/invest" ? path === "/invest" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cx(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
