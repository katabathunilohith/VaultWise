"use client";

/**
 * identity: links and images that need the sign-in token. Plain <a href> and <img src> can't send an
 * Authorization header, so when sign-in is on these fetch with the token and hand the browser a blob.
 * With sign-in off they render exactly the plain element.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { useToast } from "@/components/ui";
import { SIGN_IN_ON } from "./config";
import { withIdentity } from "./session";

function fileNameFrom(res: Response, fallback: string) {
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  return m ? decodeURIComponent(m[1]) : fallback;
}

export function AuthedDownloadLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const toast = useToast();
  if (!SIGN_IN_ON)
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  return (
    <a
      href={href}
      className={className}
      onClick={async (e) => {
        e.preventDefault();
        try {
          const res = await fetch(href, await withIdentity({ cache: "no-store" }));
          if (!res.ok) throw new Error(`Download failed (${res.status})`);
          const url = URL.createObjectURL(await res.blob());
          const a = document.createElement("a");
          a.href = url;
          a.download = fileNameFrom(res, href.split("/").pop()?.split("?")[0] || "download");
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
        } catch (err) {
          toast({ tone: "bad", text: (err as Error).message });
        }
      }}
    >
      {children}
    </a>
  );
}

function TokenImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [state, setState] = useState<{ src: string; url: string | null; failed: boolean }>({ src, url: null, failed: false });
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(src, await withIdentity({ cache: "no-store" }));
        if (!res.ok) throw new Error();
        url = URL.createObjectURL(await res.blob());
        if (!cancelled) setState({ src, url, failed: false });
      } catch {
        if (!cancelled) setState({ src, url: null, failed: true });
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);

  const current = state.src === src ? state : { src, url: null, failed: false };
  if (current.failed)
    return (
      <div className={`flex items-center justify-center gap-2 bg-sunken text-xs text-muted ${className ?? ""}`}>
        <ImageOff className="size-4" aria-hidden /> Couldn&apos;t load the photo
      </div>
    );
  if (!current.url) return <div className={`vw-pulse bg-sunken ${className ?? ""}`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={current.url} alt={alt} className={className} />;
}

/** An image from an API route. Sends the sign-in token when sign-in is on. */
export function AuthedImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (!SIGN_IN_ON) return <img src={src} alt={alt} className={className} />;
  return <TokenImage src={src} alt={alt} className={className} />;
}
