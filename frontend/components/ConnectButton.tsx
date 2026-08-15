"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { truncateAddress } from "@/lib/format";

export function ConnectButton() {
  const { status, address, error, wallets, activeWalletName, connect, disconnect, network } =
    useWallet();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (status === "connected" && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="pill hidden sm:inline-flex">{network}</span>
        <button
          onClick={disconnect}
          className="btn-secondary font-mono text-xs"
          title={activeWalletName ?? undefined}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-good" />
          {truncateAddress(address)}
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={async () => {
          const fresh = wallets.length ? wallets : [];
          if (fresh.length > 1) {
            setPickerOpen((v) => !v);
          } else {
            await connect(fresh[0]?.info.uuid);
          }
        }}
        disabled={status === "connecting"}
        className="btn-primary"
      >
        {status === "connecting" ? "Connecting…" : "Connect wallet"}
      </button>

      {pickerOpen && (
        <div className="absolute right-0 top-full z-20 mt-2 w-56 animate-rise rounded-card border border-ink-border bg-ink-surface p-1.5 shadow-xl">
          {wallets.map((w) => (
            <button
              key={w.info.uuid}
              onClick={async () => {
                setPickerOpen(false);
                await connect(w.info.uuid);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-paper hover:bg-ink-raised"
            >
              {w.info.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.info.icon} alt="" className="h-5 w-5 rounded" />
              ) : (
                <span className="h-5 w-5 rounded bg-ink-raised" />
              )}
              {w.info.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-bad/30 bg-bad/10 p-2.5 text-xs text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
