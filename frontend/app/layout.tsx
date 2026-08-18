import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";
import { ConnectButton } from "@/components/ConnectButton";
import { Logomark } from "@/components/Logomark";
import "./globals.css";

// Fraunces: a serif with real character (variable optical size, soft
// ink-on-paper feel) instead of the geometric sans that's become the
// default "AI-generated dark-mode app" tell. Fits a contract/ledger
// product better than a SaaS-startup grotesque would.
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Confluence — Collective Synthesis Engine",
  description:
    "Fund a brief, gather contributions, and let independently-verified AI synthesis split the reward pool by how much each idea actually mattered.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-ink font-body text-paper antialiased" suppressHydrationWarning>
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 sm:px-6">
          <header className="flex items-center justify-between border-b border-ink-border py-5">
            <Link href="/" className="flex items-center gap-2.5">
              <Logomark size={30} />
              <span className="font-display text-lg font-semibold tracking-tight text-paper">
                Confluence
              </span>
            </Link>
            <ConnectButton />
          </header>
          <main className="flex-1 py-8">{children}</main>
          <footer className="border-t border-ink-border py-6 text-xs text-paper-faint">
            Built on GenLayer · validators independently re-run every synthesis before
            money moves
          </footer>
        </div>
      </body>
    </html>
  );
}
