import { TransactionStatus } from "genlayer-js/types";
import { CONTRACT_ADDRESS, getReadClient, ensureCorrectNetwork } from "./genlayer";
import { logActivity, explorerTxUrl } from "./activityLog";

export type SessionStatus = "open" | "closed" | "synthesized" | "failed";

export type Session = {
  id: number;
  convener: string;
  brief: string;
  fundingAmount: string; // wei, as a string -- u256 doesn't fit a JS number
  contributionWindowDays: number;
  createdAtDay: number;
  minContributions: number;
  contributionCount: number;
  status: SessionStatus;
  synthesis: string;
  synthesisReasoning: string;
  resynthesisCount: number;
  triggerRewardPaid: boolean;
  fundingReclaimed: boolean;
};

export type Contribution = {
  index: number;
  contributor: string;
  text: string;
  submittedAtDay: number;
  attributionBps: number;
  claimed: boolean;
};

function toSession(raw: Record<string, unknown>): Session {
  return {
    id: Number(raw.id ?? 0),
    convener: raw.convener as string,
    brief: raw.brief as string,
    fundingAmount: String(raw.funding_amount ?? "0"),
    contributionWindowDays: Number(raw.contribution_window_days ?? 0),
    createdAtDay: Number(raw.created_at_day ?? 0),
    minContributions: Number(raw.min_contributions ?? 0),
    contributionCount: Number(raw.contribution_count ?? 0),
    status: raw.status as SessionStatus,
    synthesis: (raw.synthesis as string) ?? "",
    synthesisReasoning: (raw.synthesis_reasoning as string) ?? "",
    resynthesisCount: Number(raw.resynthesis_count ?? 0),
    triggerRewardPaid: Boolean(raw.trigger_reward_paid),
    fundingReclaimed: Boolean(raw.funding_reclaimed),
  };
}

function toContribution(raw: Record<string, unknown>): Contribution {
  return {
    index: Number(raw.index ?? 0),
    contributor: raw.contributor as string,
    text: (raw.text as string) ?? "",
    submittedAtDay: Number(raw.submitted_at_day ?? 0),
    attributionBps: Number(raw.attribution_bps ?? 0),
    claimed: Boolean(raw.claimed),
  };
}

/** Days since the Unix epoch — the contract works in whole days, not timestamps. */
export function currentDay(): number {
  return Math.floor(Date.now() / 86_400_000);
}

/**
 * Studionet is a shared RPC that occasionally drops a request outright
 * ("Failed to fetch") independent of anything being wrong with the
 * contract or the query -- a plain transient network hiccup. Reads
 * happen far more often than writes (every page load, every refresh
 * after an action), so without a retry here, that same class of
 * hiccup that writeContractWithRetry already handles below would show
 * up constantly as a full-page error requiring a manual reload.
 *
 * This gets hit hardest right after a write: waitForTransactionReceipt
 * already polls the RPC repeatedly to confirm ACCEPTED, and the moment
 * that resolves, the UI immediately fires 2-3 more read requests in
 * parallel to refresh -- exactly when the RPC has the least room to
 * spare. 5 attempts with a longer, growing backoff gives it more room
 * to recover than the original 3-attempt/600ms version did.
 */
async function withReadRetry<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const message = String(err?.message ?? err);
      const looksTransient = /failed to fetch|network|timeout|fetch failed/i.test(message);
      if (!looksTransient || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }
  throw new Error("Could not reach the contract after multiple attempts.");
}

// ---------------- reads ----------------

export async function getSessionCount(): Promise<number> {
  return withReadRetry(async () => {
    const client = getReadClient();
    const count = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_session_count",
      args: [],
    });
    return Number(count);
  });
}

export async function getSessions(offset: number, limit: number): Promise<Session[]> {
  return withReadRetry(async () => {
    const client = getReadClient();
    const raw = (await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_sessions",
      args: [offset, limit],
    })) as Record<string, unknown>[];
    return raw.map(toSession);
  });
}

export async function getSession(sessionId: number): Promise<Session> {
  return withReadRetry(async () => {
    const client = getReadClient();
    const raw = (await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_session",
      args: [sessionId],
    })) as Record<string, unknown>;
    return toSession(raw);
  });
}

export async function getSessionContributions(sessionId: number): Promise<Contribution[]> {
  return withReadRetry(async () => {
    const client = getReadClient();
    const raw = (await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_session_contributions",
      args: [sessionId],
    })) as Record<string, unknown>[];
    return raw.map(toContribution);
  });
}

export async function hasContributed(sessionId: number, address: string): Promise<boolean> {
  return withReadRetry(async () => {
    const client = getReadClient();
    const result = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "has_contributed",
      args: [sessionId, address],
    });
    return Boolean(result);
  });
}

// ---------------- writes ----------------
// Every write connects the wallet to the configured network, submits,
// then waits for ACCEPTED consensus before trusting the result.
//
// ACCEPTED, not FINALIZED: per GenLayer's own docs
// (docs.genlayer.com/developers/decentralized-applications/writing-data
// → "Using a Browser Wallet (MetaMask)"), the browser-wallet example
// waits for ACCEPTED. That's the point in the transaction lifecycle
// (Pending → Proposing → Committing → Revealing → Accepted → Finalized)
// where validator consensus has already been reached and the state is
// real -- FINALIZED is an extra confirmation-depth guarantee on top of
// that, and waiting for it is what made writes look hung even though
// they'd already gone through.

type WriteParams = {
  address: `0x${string}`;
  functionName: string;
  args: any[];
  value: bigint;
};

/**
 * StudioNet is a shared, rate-limited RPC -- genlayer-js's
 * writeContract() internally calls eth_gasPrice/eth_estimateGas before
 * it ever submits anything, and those specific calls have been observed
 * getting rate-limited or dropped ("Failed to fetch") on their own,
 * independent of whether the actual write would have gone through.
 * writeContract has no gas/gasPrice override to skip that pre-flight
 * step, so the fix has to be a retry at this layer.
 *
 * A failure never reached the network in this case -- no hash was
 * returned yet -- so retrying the whole submission here can't
 * double-execute a write the way retrying an already-submitted
 * transaction's wait step could.
 */
async function writeContractWithRetry(
  client: Awaited<ReturnType<typeof ensureCorrectNetwork>>,
  params: WriteParams,
  maxAttempts = 3
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await client.writeContract(params);
    } catch (err: any) {
      const message = String(err?.message ?? err);
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
  walletAddress: `0x${string}`,
  functionName: string,
  args: any[],
  value: bigint = BigInt(0)
) {
  const client = await ensureCorrectNetwork(walletAddress);
  const hash = await writeContractWithRetry(client, {
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value,
  });

  logActivity({ hash, functionName, args, status: "pending", timestamp: Date.now() });

  try {
    const receipt = await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
      retries: 60,
      interval: 3000,
    });
    logActivity({ hash, functionName, args, status: "finalized", timestamp: Date.now() });
    // Small deliberate pause before the caller refreshes the UI.
    // waitForTransactionReceipt just finished polling the RPC
    // repeatedly to confirm ACCEPTED; firing 2-3 more read requests at
    // it in the same instant the polling stops is exactly when
    // Studionet's shared RPC has been observed dropping requests
    // ("Failed to fetch"). withReadRetry in this file already absorbs
    // that if it happens, but giving the RPC a moment here means the
    // very first read attempt is more likely to just succeed.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return { hash, receipt };
  } catch (err: any) {
    // Consensus can take longer than our wait window even though the
    // transaction is still going through -- don't treat this as a
    // failure, just hand back the hash so the caller can point the user
    // at the Explorer instead of showing a scary error.
    logActivity({ hash, functionName, args, status: "pending-long", timestamp: Date.now() });
    throw new Error(
      `Still waiting on validator consensus (this can take longer than usual). Check the transaction directly: ${explorerTxUrl(hash)}`
    );
  }
}

export async function createSession(
  walletAddress: `0x${string}`,
  params: {
    brief: string;
    contributionWindowDays: number;
    minContributions: number;
    fundingWei: bigint;
  }
) {
  return writeAndWait(
    walletAddress,
    "create_session",
    [params.brief, params.contributionWindowDays, params.minContributions, currentDay()],
    params.fundingWei
  );
}

export async function submitContribution(
  walletAddress: `0x${string}`,
  sessionId: number,
  text: string
) {
  return writeAndWait(walletAddress, "submit_contribution", [sessionId, text, currentDay()]);
}

export async function synthesize(walletAddress: `0x${string}`, sessionId: number) {
  return writeAndWait(walletAddress, "synthesize", [sessionId, currentDay()]);
}

export async function requestResynthesis(walletAddress: `0x${string}`, sessionId: number) {
  return writeAndWait(walletAddress, "request_resynthesis", [sessionId]);
}

export async function claimReward(
  walletAddress: `0x${string}`,
  sessionId: number,
  contributionIndex: number
) {
  return writeAndWait(walletAddress, "claim_reward", [sessionId, contributionIndex]);
}

export async function reclaimFunding(walletAddress: `0x${string}`, sessionId: number) {
  return writeAndWait(walletAddress, "reclaim_funding", [sessionId]);
}

// ---------------- helpers ----------------

export function shortAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}···${address.slice(-4)}`;
}
