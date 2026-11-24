import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/shared";

/**
 * legal: a light frame for the public pages, for people who aren't signed in (Google Play needs the
 * privacy policy and the account-deletion page to open without an account).
 *
 * To use it, the shell (src/components/shell.tsx) returns public pages in this frame, after its hooks and
 * before its sign-in gate, so they open the same for everyone, signed in or not:
 *   const path = usePathname();
 *   if (isPublicPage(path)) return <PublicFrame>{children}</PublicFrame>; // legal
 */
export function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-plane">
      <header className="border-b border-line bg-brand">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
              <rect width="32" height="32" rx="9" fill="#2a78d6" />
              <path d="M9 10.5h3.2l3.8 9.4 3.8-9.4H23l-5.5 12.5h-3z" fill="#fff" />
            </svg>
            <span className="text-[15px] font-semibold text-white">{BRAND.name}</span>
          </Link>
          <Link href="/" className="text-[13px] font-medium text-brand-muted hover:text-white">
            Open the app
          </Link>
        </div>
      </header>
      <main className="px-4 py-8 sm:px-6 lg:py-12">{children}</main>
    </div>
  );
}
