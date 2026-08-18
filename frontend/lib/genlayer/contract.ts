import { createClient } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";
import type { GenLayerClient, CalldataEncodable } from "genlayer-js/types";
import { isAddress } from "viem";
import { ACTIVE_CHAIN, ACTIVE_NETWORK, CONTRACT_ADDRESS } from "./chains";

export type SessionStatus = "open" | "closed" | "synthesized" | "failed";

export interface SessionDTO {
  id: number;
  convener: string;
  brief: string;
  funding_amount: string; // wei, as a string (u256 doesn't fit a JS number)
  contribution_window_days: number;
  created_at_day: number;
  min_contributions: number;
  contribution_count: number;
  status: SessionStatus;
  synthesis: string;
  synthesis_reasoning: string;
  resynthesis_count: number;
  trigger_reward_paid: boolean;
  funding_reclaimed: boolean;
}

export interface ContributionDTO {
  index: number;
  contributor: string;
  text: string;
  submitted_at_day: number;
  attribution_bps: number;
  claimed: boolean;
}

/** Read-only client — works without a connected wallet. */
let _publicClient: GenLayerClient<any> | null = null;
function publicClient(): GenLayerClient<any> {
  if (!_publicClient) {
    _publicClient = createClient({ chain: ACTIVE_CHAIN }) as GenLayerClient<any>;
  }
  return _publicClient;
}

function assertContractConfigured() {
  if (!CONTRACT_ADDRESS || !isAddress(CONTRACT_ADDRESS)) {
    throw new Error(
      `NEXT_PUBLIC_CONTRACT_ADDRESS ("${CONTRACT_ADDRESS}") isn't a valid deployed contract ` +
        `address. Deploy contracts/confluence.py, then paste the printed address into ` +
        `frontend/.env.local — check for stray quotes or a trailing space/newline from ` +
        `copy-pasting.`
    );
  }
}

/**
 * The GenLayer node rejects malformed gen_call/gen_call requests with a
 * generic JSON-RPC "Missing or invalid parameters" error, before your
 * contract code ever runs — that's a transport-level rejection, not a
 * contract bug. Almost always means the contract address is wrong/not
 * deployed on the configured network, or the RPC is unreachable. This
 * wrapper turns that cryptic error into something actionable.
 */
async function withReadErrorContext<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Couldn't read from the contract at ${CONTRACT_ADDRESS} on ${ACTIVE_NETWORK}. ` +
        `Check it's actually deployed on this network and the address in .env.local is ` +
        `correct. (${message})`
    );
  }
}

/** Days since the Unix epoch — the contract works in whole days, not timestamps. */
export function currentDay(): number {
  return Math.floor(Date.now() / 86_400_000);
}

// ==================== READS ====================

export async function getSessionCount(): Promise<number> {
  assertContractConfigured();
  return withReadErrorContext(async () => {
    const result = await publicClient().readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      functionName: "get_session_count",
      args: [],
    });
    return Number(result);
  });
}

export async function getSessions(offset: number, limit: number): Promise<SessionDTO[]> {
  assertContractConfigured();
  return withReadErrorContext(async () => {
    const result = await publicClient().readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      functionName: "get_sessions",
      args: [offset, limit],
    });
    return result as unknown as SessionDTO[];
  });
}

export async function getSession(sessionId: number): Promise<SessionDTO> {
  assertContractConfigured();
  return withReadErrorContext(async () => {
    const result = await publicClient().readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      functionName: "get_session",
      args: [sessionId],
    });
    return result as unknown as SessionDTO;
  });
}

export async function getSessionContributions(sessionId: number): Promise<ContributionDTO[]> {
  assertContractConfigured();
  return withReadErrorContext(async () => {
    const result = await publicClient().readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      functionName: "get_session_contributions",
      args: [sessionId],
    });
    return result as unknown as ContributionDTO[];
  });
}

export async function hasContributed(sessionId: number, address: string): Promise<boolean> {
  assertContractConfigured();
  return withReadErrorContext(async () => {
    const result = await publicClient().readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      functionName: "has_contributed",
      args: [sessionId, address],
    });
    return Boolean(result);
  });
}

// ==================== WRITES ====================
// Every write takes the connected wallet's genlayer-js client (built in
// WalletProvider from just the address — see connectChain.ts for why we
// never call client.connect()).

type WriteClient = GenLayerClient<any>;

/**
 * Studionet is a shared, rate-limited RPC — genlayer-js's writeContract()
 * calls eth_gasPrice/eth_estimateGas internally before it submits
 * anything, and those specific calls have been observed getting
 * rate-limited or dropped ("Failed to fetch") independently of whether
 * the actual write would have gone through. writeContract has no
 * gas/gasPrice override to skip that pre-flight step, so the fix is a
 * retry at this layer instead — matching GenLayer's own docs' "Best
 * Practices" backoff pattern. A failure here never reached the network
 * (no hash was returned yet), so retrying the whole submission can't
 * double-execute anything the way retrying an already-submitted
 * transaction's wait step could.
 */
async function writeContractWithRetry(
  client: WriteClient,
  params: { address: `0x${string}`; functionName: string; args: CalldataEncodable[]; value: bigint },
  maxAttempts = 3
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await client.writeContract(params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const looksTransient =
        /rate limit|failed to fetch|network|timeout|eth_gasPrice|eth_estimateGas/i.test(message);
      const looksUserCaused = /user rejected|insufficient funds|denied/i.test(message);

      if (looksUserCaused || !looksTransient || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw new Error("Could not submit the transaction after multiple attempts.");
}

async function writeAndWait(
  client: WriteClient,
  functionName: string,
  args: CalldataEncodable[],
  value?: bigint
) {
  const hash = await writeContractWithRetry(client, {
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName,
    args,
    value: value ?? BigInt(0),
  });
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
  });
  return { hash, receipt };
}

export async function createSession(
  client: WriteClient,
  params: {
    brief: string;
    contributionWindowDays: number;
    minContributions: number;
    fundingWei: bigint;
  }
) {
  assertContractConfigured();
  return writeAndWait(
    client,
    "create_session",
    [params.brief, params.contributionWindowDays, params.minContributions, currentDay()],
    params.fundingWei
  );
}

export async function submitContribution(
  client: WriteClient,
  sessionId: number,
  text: string
) {
  assertContractConfigured();
  return writeAndWait(client, "submit_contribution", [sessionId, text, currentDay()]);
}

export async function synthesize(client: WriteClient, sessionId: number) {
  assertContractConfigured();
  return writeAndWait(client, "synthesize", [sessionId, currentDay()]);
}

export async function requestResynthesis(client: WriteClient, sessionId: number) {
  assertContractConfigured();
  return writeAndWait(client, "request_resynthesis", [sessionId]);
}

export async function claimReward(
  client: WriteClient,
  sessionId: number,
  contributionIndex: number
) {
  assertContractConfigured();
  return writeAndWait(client, "claim_reward", [sessionId, contributionIndex]);
}

export async function reclaimFunding(client: WriteClient, sessionId: number) {
  assertContractConfigured();
  return writeAndWait(client, "reclaim_funding", [sessionId]);
}
