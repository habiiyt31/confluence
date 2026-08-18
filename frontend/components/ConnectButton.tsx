"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/lib/useWallet";
import { shortAddress } from "@/lib/contract";

export function ConnectButton() {
  const { address, connecting, error, connect, disconnect } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const network = process.env.NEXT_PUBLIC_GENLAYER_NETWORK ?? "studionet";

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <div className="flex items-center gap-2">
        <span className="pill hidden sm:inline-flex">{network}</span>
        {address ? (
          <>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="btn-secondary font-mono text-xs"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-good" />
              {shortAddress(address)}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-2 w-40 animate-rise overflow-hidden rounded-md border border-ink-border bg-ink-surface">
                <button
                  onClick={() => {
                    disconnect();
                    setMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-sm text-paper-muted transition hover:bg-ink-raised hover:text-paper"
                >
                  Disconnect
                </button>
              </div>
            )}
          </>
        ) : (
          <button onClick={connect} disabled={connecting} className="btn-primary">
            {connecting ? "Connecting…" : "Connect wallet"}
          </button>
        )}
      </div>

      {error && (
        <p className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-bad/30 bg-bad/10 p-2.5 text-xs text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
