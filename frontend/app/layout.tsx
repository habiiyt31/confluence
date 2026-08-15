import type { Metadata } from "next";
import { Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google";
import { WalletProvider } from "@/lib/wallet/WalletProvider";
import { ConnectButton } from "@/components/ConnectButton";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
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
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-ink font-body text-paper antialiased">
        <WalletProvider>
          <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 sm:px-6">
            <header className="flex items-center justify-between border-b border-ink-border py-5">
              <a href="/" className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-synth/20 text-sm font-display font-semibold text-synth">
                  C
                </span>
                <span className="font-display text-lg font-semibold tracking-tight text-paper">
                  Confluence
                </span>
              </a>
              <ConnectButton />
            </header>
            <main className="flex-1 py-8">{children}</main>
            <footer className="border-t border-ink-border py-6 text-xs text-paper-faint">
              Built on GenLayer · validators independently re-run every synthesis before
              money moves
            </footer>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
