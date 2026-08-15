/**
 * EIP-6963 ("Multi Injected Provider Discovery") support.
 *
 * If we just read `window.ethereum`, whichever wallet extension loaded
 * last wins and silently shadows the others — a real problem the moment
 * someone has both MetaMask and OKX Wallet installed, which is exactly
 * the situation this app needs to support. EIP-6963 lets every installed
 * wallet announce itself with a stable rdns id, so the user picks
 * explicitly instead of us guessing.
 */

export interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
}

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

type AnnounceEvent = CustomEvent<EIP6963ProviderDetail>;

/**
 * Listens for wallet announcements for `timeoutMs` and resolves with
 * whatever announced in that window. Also dispatches the "request"
 * event, which is what prompts already-loaded wallets to announce
 * themselves immediately (per the EIP-6963 spec).
 */
export function discoverWallets(timeoutMs = 300): Promise<EIP6963ProviderDetail[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve([]);
      return;
    }

    const found = new Map<string, EIP6963ProviderDetail>();

    const onAnnounce = (event: Event) => {
      const detail = (event as AnnounceEvent).detail;
      if (detail?.info?.uuid) {
        found.set(detail.info.uuid, detail);
      }
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      resolve(Array.from(found.values()));
    }, timeoutMs);
  });
}

/**
 * Fallback for wallets that predate EIP-6963 and only expose
 * `window.ethereum`. Used only if discoverWallets() comes back empty.
 */
export function getLegacyInjectedProvider(): EIP1193Provider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
  return eth ?? null;
}
