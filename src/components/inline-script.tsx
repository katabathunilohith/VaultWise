"use client";

/**
 * Runs during HTML parsing on a full page load (type text/javascript in the
 * server render) and is inert on the client (text/plain), so React doesn't warn
 * about rendering a <script>. See Next's "preventing flash before hydration" guide.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
