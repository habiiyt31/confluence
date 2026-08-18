"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@/lib/useWallet";
import {
  synthesize,
  requestResynthesis,
  claimReward,
  reclaimFunding,
  currentDay,
} from "@/lib/contract";
import { formatGEN } from "@/lib/format";
import type { Contribution, Session } from "@/lib/contract";

export function SessionActions({
  session,
  contributions,
  onChanged,
}: {
  session: Session;
  contributions: Contribution[];
  onChanged: () => void;
}) {
  const { address } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isConvener = !!address && address.toLowerCase() === session.convener.toLowerCase();
  const myContribution = useMemo(
    () => contributions.find((c) => c.contributor.toLowerCase() === address?.toLowerCase()),
    [contributions, address]
  );

  const windowPassed =
    currentDay() > session.createdAtDay + session.contributionWindowDays;
  const enoughContributions = session.contributionCount >= session.minContributions;
  const canSynthesize =
    (session.status === "open" || session.status === "closed") &&
    (windowPassed || enoughContributions);

  async function run(label: string, fn: (addr: `0x${string}`) => Promise<unknown>) {
    if (!address) return;
    setBusy(label);
    setError(null);
    try {
      await fn(address);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${label.toLowerCase()}`);
    } finally {
      setBusy(null);
    }
  }

  const actions: React.ReactNode[] = [];

  if (canSynthesize) {
    actions.push(
      <button
        key="synthesize"
        onClick={() => run("Synthesize", (addr) => synthesize(addr, session.id))}
        disabled={!address || busy !== null}
        className="btn-primary"
      >
        {busy === "Synthesize" ? "Synthesizing…" : "Run synthesis"}
      </button>
    );
  }

  if (
    session.status === "synthesized" &&
    isConvener &&
    session.resynthesisCount < 1 &&
    !contributions.some((c) => c.claimed)
  ) {
    actions.push(
      <button
        key="resynth"
        onClick={() => run("Request resynthesis", (addr) => requestResynthesis(addr, session.id))}
        disabled={!address || busy !== null}
        className="btn-secondary"
      >
        {busy === "Request resynthesis" ? "Requesting…" : "Request re-synthesis"}
      </button>
    );
  }

  if (session.status === "synthesized" && myContribution && !myContribution.claimed) {
    actions.push(
      <button
        key="claim"
        onClick={() =>
          run("Claim reward", (addr) => claimReward(addr, session.id, myContribution.index))
        }
        disabled={!address || busy !== null}
        className="btn-primary"
      >
        {busy === "Claim reward"
          ? "Claiming…"
          : `Claim reward (${myContribution.attributionBps / 100}% share)`}
      </button>
    );
  }

  if (session.status === "synthesized" && myContribution?.claimed) {
    actions.push(
      <span key="claimed" className="pill">
        Reward claimed
      </span>
    );
  }

  if (session.status === "failed" && isConvener && !session.fundingReclaimed) {
    actions.push(
      <button
        key="reclaim"
        onClick={() => run("Reclaim funding", (addr) => reclaimFunding(addr, session.id))}
        disabled={!address || busy !== null}
        className="btn-secondary"
      >
        {busy === "Reclaim funding"
          ? "Reclaiming…"
          : `Reclaim ${formatGEN(session.fundingAmount)} GEN`}
      </button>
    );
  }

  if (actions.length === 0 && !error) return null;

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap gap-2">{actions}</div>
      {error && <p className="text-xs text-bad">{error}</p>}
      {!address && actions.length > 0 && (
        <p className="text-xs text-paper-muted">Connect a wallet to take this action.</p>
      )}
    </div>
  );
}
