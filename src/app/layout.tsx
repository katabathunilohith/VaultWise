import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { InlineScript } from "@/components/inline-script";
import { Shell } from "@/components/shell";
import { AiConsentHost } from "@/components/ai-consent";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vaultwise · Payout planner",
  description: "Plan for fuel and bills between delivery payouts, test a late payday and compare the plan with what arrived.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#12233f" },
    { media: "(prefers-color-scheme: dark)", color: "#101826" },
  ],
};

// Applies a saved theme before first paint so there's no flash.
const themeScript = `try{var t=localStorage.getItem('vw-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <InlineScript html={themeScript} />
      </head>
      <body>
        <Shell>{children}</Shell>
        {/* ai-consent: asks "Can an AI read what you send?" before the first bill, ID photo or assistant message. */}
        <AiConsentHost />
      </body>
    </html>
  );
}
