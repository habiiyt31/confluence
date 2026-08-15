import { createClient } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";
import type { GenLayerClient, CalldataEncodable } from "genlayer-js/types";
import { ACTIVE_CHAIN, CONTRACT_ADDRESS } from "./chains";

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
  if (!CONTRACT_ADDRESS) {
    throw new Error(
      "NEXT_PUBLIC_CONTRACT_ADDRESS is not set — deploy the contract and add its address to .env.local"
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
  const result = await publicClient().readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_session_count",
    args: [],
  });
  return Number(result);
}

export async function getSessions(offset: number, limit: number): Promise<SessionDTO[]> {
  assertContractConfigured();
  const result = await publicClient().readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_sessions",
    args: [offset, limit],
  });
  return result as unknown as SessionDTO[];
}

export async function getSession(sessionId: number): Promise<SessionDTO> {
  assertContractConfigured();
  const result = await publicClient().readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_session",
    args: [sessionId],
  });
  return result as unknown as SessionDTO;
}

export async function getSessionContributions(sessionId: number): Promise<ContributionDTO[]> {
  assertContractConfigured();
  const result = await publicClient().readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_session_contributions",
    args: [sessionId],
  });
  return result as unknown as ContributionDTO[];
}

export async function hasContributed(sessionId: number, address: string): Promise<boolean> {
  assertContractConfigured();
  const result = await publicClient().readContract({
    address: CONTRACT_ADDRESS,
    functionName: "has_contributed",
    args: [sessionId, address],
  });
  return Boolean(result);
}

// ==================== WRITES ====================
// Every write takes the connected wallet's genlayer-js client (built in
// WalletProvider from just the address — see connectChain.ts for why we
// never call client.connect()).

type WriteClient = GenLayerClient<any>;

async function writeAndWait(
  client: WriteClient,
  functionName: string,
  args: CalldataEncodable[],
  value?: bigint
) {
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
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
