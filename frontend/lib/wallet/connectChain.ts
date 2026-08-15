/**
 * Chain connect/switch logic for the wallet.
 *
 * ────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS INSTEAD OF JUST CALLING client.connect()
 * ────────────────────────────────────────────────────────────────────
 * The GenLayer docs' own "Using a Browser Wallet" example calls
 * `client.connect("studionet")` to get MetaMask onto the right chain
 * before writing. In practice, against a plain MetaMask or OKX Wallet
 * install (no Snaps enabled), that call can throw:
 *
 *   "method [wallet_getSnaps] doesn't has corresponding handler"
 *
 * `wallet_getSnaps` is a MetaMask *Snaps* RPC method
 * (docs.metamask.io/snaps/how-to/connect-to-a-snap) — it has nothing to
 * do with plain network switching. It's not part of EIP-3326 or
 * EIP-1193. A wallet that never enabled Snaps support (which is most
 * regular MetaMask installs, and every non-MetaMask wallet like OKX)
 * has no handler registered for it and rejects the call outright,
 * which surfaces to the user as a failed signature right when they're
 * trying to submit a transaction.
 *
 * The fix: don't call client.connect() at all. Do the chain check and
 * switch ourselves with the plain, wallet-agnostic standards:
 *   - EIP-3326 `wallet_switchEthereumChain`
 *   - EIP-3085 `wallet_addEthereumChain` (fallback if the chain isn't
 *     already registered in the wallet — error code 4902)
 * Then build the genlayer-js client with just the address, which is
 * the officially supported "MetaMask will handle signing" mode.
 */
import type { EIP1193Provider } from "./eip6963";
import { ACTIVE_ADD_CHAIN_PARAMS } from "@/lib/genlayer/chains";

export class WrongChainError extends Error {
  constructor(public currentChainId: string, public expectedChainId: string) {
    super(
      `Wallet is on chain ${currentChainId}, expected ${expectedChainId}. ` +
        `Switch networks in your wallet and try again.`
    );
    this.name = "WrongChainError";
  }
}

function isRpcError(err: unknown): err is { code: number; message?: string } {
  return typeof err === "object" && err !== null && "code" in err;
}

/** Reads the wallet's current chain id, normalized to lowercase "0x…" hex. */
export async function getChainId(provider: EIP1193Provider): Promise<string> {
  const raw = (await provider.request({ method: "eth_chainId" })) as string;
  return raw.toLowerCase();
}

/**
 * Ensures the given provider is on the target GenLayer network.
 * Uses only EIP-3326 / EIP-3085 — never client.connect(), see file
 * header. Safe to call every time before a write, not just once.
 */
export async function ensureCorrectChain(provider: EIP1193Provider): Promise<void> {
  const target = ACTIVE_ADD_CHAIN_PARAMS;
  const current = await getChainId(provider);
  if (current === target.chainId.toLowerCase()) {
    return; // already on the right network — nothing to do
  }

  try {
    // EIP-3326: ask the wallet to switch to a chain it already knows about.
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: target.chainId }],
    });
  } catch (err) {
    // 4902 = chain not added to the wallet yet.
    if (isRpcError(err) && err.code === 4902) {
      // EIP-3085: register the chain, which (per spec) also switches to it.
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [target],
      });
    } else {
      throw err;
    }
  }

  // Some wallets resolve wallet_switchEthereumChain before the internal
  // chain state is fully settled — re-read to confirm rather than trust
  // the resolved promise blindly.
  const confirmed = await getChainId(provider);
  if (confirmed !== target.chainId.toLowerCase()) {
    throw new WrongChainError(confirmed, target.chainId);
  }
}

/** Requests account access and returns the first (active) address. */
export async function requestAccount(provider: EIP1193Provider): Promise<`0x${string}`> {
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts?.[0]) {
    throw new Error("No account returned by wallet");
  }
  return accounts[0] as `0x${string}`;
}
