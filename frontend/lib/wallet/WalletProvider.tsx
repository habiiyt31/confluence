"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "genlayer-js";
import type { GenLayerClient } from "genlayer-js/types";
import {
  discoverWallets,
  getLegacyInjectedProvider,
  type EIP1193Provider,
  type EIP6963ProviderDetail,
} from "./eip6963";
import { ensureCorrectChain, requestAccount } from "./connectChain";
import { ACTIVE_CHAIN, ACTIVE_NETWORK } from "@/lib/genlayer/chains";

type Status = "disconnected" | "connecting" | "connected" | "error";

interface WalletState {
  status: Status;
  address: `0x${string}` | null;
  error: string | null;
  wallets: EIP6963ProviderDetail[];
  activeWalletName: string | null;
  client: GenLayerClient<any> | null;
  provider: EIP1193Provider | null;
  network: typeof ACTIVE_NETWORK;
  connect: (uuid?: string) => Promise<void>;
  disconnect: () => void;
  refreshWallets: () => Promise<void>;
  /** Re-checks the wallet is still on the right chain; call before writes. */
  reverifyChain: () => Promise<void>;
}

const WalletContext = createContext<WalletState | null>(null);

const LAST_WALLET_KEY = "confluence.lastWalletRdns";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("disconnected");
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<EIP6963ProviderDetail[]>([]);
  const [activeWalletName, setActiveWalletName] = useState<string | null>(null);

  const providerRef = useRef<EIP1193Provider | null>(null);
  const clientRef = useRef<GenLayerClient<any> | null>(null);
  const [, forceRender] = useState(0);

  const refreshWallets = useCallback(async () => {
    const found = await discoverWallets();
    setWallets(found);
  }, []);

  useEffect(() => {
    refreshWallets();
  }, [refreshWallets]);

  const buildClient = useCallback((addr: `0x${string}`) => {
    // Address-only account => genlayer-js defers signing to the injected
    // wallet (the officially supported "MetaMask will handle signing"
    // mode). We deliberately never call client.connect() here — see
    // lib/wallet/connectChain.ts for why.
    clientRef.current = createClient({
      chain: ACTIVE_CHAIN,
      account: addr,
    }) as GenLayerClient<any>;
    forceRender((n) => n + 1);
  }, []);

  const attachProviderListeners = useCallback(
    (provider: EIP1193Provider) => {
      const onAccountsChanged = (...args: unknown[]) => {
        const accounts = args[0] as string[];
        if (!accounts?.length) {
          setStatus("disconnected");
          setAddress(null);
          clientRef.current = null;
          return;
        }
        const next = accounts[0] as `0x${string}`;
        setAddress(next);
        buildClient(next);
      };
      const onChainChanged = () => {
        // Re-validate lazily on next write rather than forcing a reload;
        // just clear any stale error so the next action re-checks.
        setError(null);
      };
      const onDisconnect = () => {
        setStatus("disconnected");
        setAddress(null);
        clientRef.current = null;
      };

      provider.on("accountsChanged", onAccountsChanged);
      provider.on("chainChanged", onChainChanged);
      provider.on("disconnect", onDisconnect);

      return () => {
        provider.removeListener("accountsChanged", onAccountsChanged);
        provider.removeListener("chainChanged", onChainChanged);
        provider.removeListener("disconnect", onDisconnect);
      };
    },
    [buildClient]
  );

  const connect = useCallback(
    async (uuid?: string) => {
      setStatus("connecting");
      setError(null);
      try {
        let detail: EIP6963ProviderDetail | undefined;
        if (uuid) {
          detail = wallets.find((w) => w.info.uuid === uuid);
        } else {
          const fresh = await discoverWallets();
          setWallets(fresh);
          detail = fresh[0];
        }

        let provider: EIP1193Provider | null = detail?.provider ?? null;
        let walletName = detail?.info.name ?? null;

        if (!provider) {
          provider = getLegacyInjectedProvider();
          walletName = walletName ?? "Injected wallet";
        }
        if (!provider) {
          throw new Error(
            "No wallet found. Install MetaMask, OKX Wallet, or another EIP-1193 wallet."
          );
        }

        const addr = await requestAccount(provider);
        await ensureCorrectChain(provider);

        providerRef.current = provider;
        attachProviderListeners(provider);
        setAddress(addr);
        setActiveWalletName(walletName);
        buildClient(addr);
        if (detail?.info.rdns) {
          try {
            window.localStorage.setItem(LAST_WALLET_KEY, detail.info.rdns);
          } catch {
            // localStorage may be unavailable (private browsing) — non-fatal
          }
        }
        setStatus("connected");
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to connect wallet");
      }
    },
    [wallets, attachProviderListeners, buildClient]
  );

  const disconnect = useCallback(() => {
    setStatus("disconnected");
    setAddress(null);
    setActiveWalletName(null);
    setError(null);
    clientRef.current = null;
    providerRef.current = null;
  }, []);

  // Best-effort silent reconnect to the last-used wallet on load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let lastRdns: string | null = null;
      try {
        lastRdns = window.localStorage.getItem(LAST_WALLET_KEY);
      } catch {
        return;
      }
      if (!lastRdns) return;

      const found = await discoverWallets();
      if (cancelled) return;
      setWallets(found);
      const match = found.find((w) => w.info.rdns === lastRdns);
      if (!match) return;

      try {
        const accounts = (await match.provider.request({
          method: "eth_accounts", // does not prompt, unlike eth_requestAccounts
        })) as string[];
        if (cancelled || !accounts?.length) return;

        providerRef.current = match.provider;
        attachProviderListeners(match.provider);
        setAddress(accounts[0] as `0x${string}`);
        setActiveWalletName(match.info.name);
        buildClient(accounts[0] as `0x${string}`);
        setStatus("connected");
      } catch {
        // silent — user can connect manually
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reverifyChain = useCallback(async () => {
    if (!providerRef.current) throw new Error("No wallet connected");
    await ensureCorrectChain(providerRef.current);
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      status,
      address,
      error,
      wallets,
      activeWalletName,
      client: clientRef.current,
      provider: providerRef.current,
      network: ACTIVE_NETWORK,
      connect,
      disconnect,
      refreshWallets,
      reverifyChain,
    }),
    [status, address, error, wallets, activeWalletName, connect, disconnect, refreshWallets, reverifyChain]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
