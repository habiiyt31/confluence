"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import {
  synthesize,
  requestResynthesis,
  claimReward,
  reclaimFunding,
  currentDay,
} from "@/lib/genlayer/contract";
import { formatGEN } from "@/lib/format";
import type { ContributionDTO, SessionDTO } from "@/lib/genlayer/contract";

export function SessionActions({
  session,
  contributions,
  onChanged,
}: {
  session: SessionDTO;
  contributions: ContributionDTO[];
  onChanged: () => void;
}) {
  const { client, address, reverifyChain } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isConvener = !!address && address.toLowerCase() === session.convener.toLowerCase();
  const myContribution = useMemo(
    () => contributions.find((c) => c.contributor.toLowerCase() === address?.toLowerCase()),
    [contributions, address]
  );

  const windowPassed =
    currentDay() > session.created_at_day + session.contribution_window_days;
  const enoughContributions = session.contribution_count >= session.min_contributions;
  const canSynthesize =
    (session.status === "open" || session.status === "closed") &&
    (windowPassed || enoughContributions);

  async function run(label: string, fn: () => Promise<unknown>) {
    if (!client) return;
    setBusy(label);
    setError(null);
    try {
      await reverifyChain();
      await fn();
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
        onClick={() => run("Synthesize", () => synthesize(client!, session.id))}
        disabled={!client || busy !== null}
        className="btn-primary"
      >
        {busy === "Synthesize" ? "Synthesizing…" : "Run synthesis"}
      </button>
    );
  }

  if (
    session.status === "synthesized" &&
    isConvener &&
    session.resynthesis_count < 1 &&
    !contributions.some((c) => c.claimed)
  ) {
    actions.push(
      <button
        key="resynth"
        onClick={() => run("Request resynthesis", () => requestResynthesis(client!, session.id))}
        disabled={!client || busy !== null}
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
          run("Claim reward", () => claimReward(client!, session.id, myContribution.index))
        }
        disabled={!client || busy !== null}
        className="btn-primary"
      >
        {busy === "Claim reward"
          ? "Claiming…"
          : `Claim reward (${myContribution.attribution_bps / 100}% share)`}
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

  if (session.status === "failed" && isConvener && !session.funding_reclaimed) {
    actions.push(
      <button
        key="reclaim"
        onClick={() => run("Reclaim funding", () => reclaimFunding(client!, session.id))}
        disabled={!client || busy !== null}
        className="btn-secondary"
      >
        {busy === "Reclaim funding"
          ? "Reclaiming…"
          : `Reclaim ${formatGEN(session.funding_amount)} GEN`}
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
