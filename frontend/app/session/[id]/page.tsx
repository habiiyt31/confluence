"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { StatusBadge } from "@/components/StatusBadge";
import { ContributeForm } from "@/components/ContributeForm";
import { ContributionsList } from "@/components/ContributionsList";
import { SynthesisPanel } from "@/components/SynthesisPanel";
import { SessionActions } from "@/components/SessionActions";
import { formatGEN, daysRemaining, truncateAddress } from "@/lib/format";
import {
  getSession,
  getSessionContributions,
  hasContributed,
  currentDay,
} from "@/lib/genlayer/contract";
import type { ContributionDTO, SessionDTO } from "@/lib/genlayer/contract";

export default function SessionPage({ params }: { params: { id: string } }) {
  const sessionId = Number(params.id);
  const { address } = useWallet();

  const [session, setSession] = useState<SessionDTO | null>(null);
  const [contributions, setContributions] = useState<ContributionDTO[]>([]);
  const [alreadyContributed, setAlreadyContributed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        getSession(sessionId),
        getSessionContributions(sessionId),
      ]);
      setSession(s);
      setContributions(c);
      setError(null);
      if (address) {
        setAlreadyContributed(await hasContributed(sessionId, address));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    }
  }, [sessionId, address]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="card border-bad/30 bg-bad/10 text-sm text-bad">
        {error}
      </div>
    );
  }

  if (!session) {
    return <div className="card h-40 animate-pulseSlow" />;
  }

  const remaining = daysRemaining(
    session.created_at_day,
    session.contribution_window_days,
    currentDay()
  );

  return (
    <div className="space-y-6">
      <Link href="/" className="text-xs text-paper-muted hover:text-paper">
        ← All sessions
      </Link>

      <div className="card animate-rise space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-xl font-semibold leading-snug text-paper sm:text-2xl">
            {session.brief}
          </h1>
          <StatusBadge status={session.status} />
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-paper-muted">
          <span>
            <span className="font-mono text-reward">{formatGEN(session.funding_amount)} GEN</span>{" "}
            pool
          </span>
          <span>
            <span className="font-mono text-paper">
              {session.contribution_count}/{session.min_contributions}
            </span>{" "}
            contributions
          </span>
          <span>
            convened by{" "}
            <span className="font-mono text-paper">{truncateAddress(session.convener)}</span>
          </span>
          {session.status === "open" && (
            <span>
              {remaining > 0 ? (
                <>
                  <span className="font-mono text-paper">{remaining}d</span> left to contribute
                </>
              ) : (
                "window closed — ready to synthesize"
              )}
            </span>
          )}
        </div>
      </div>

      <SessionActions session={session} contributions={contributions} onChanged={load} />

      {session.status === "open" &&
        (alreadyContributed ? (
          <div className="card text-sm text-paper-muted">
            You&apos;ve already contributed to this session — one contribution per wallet.
          </div>
        ) : (
          <ContributeForm sessionId={sessionId} onSubmitted={load} />
        ))}

      {session.status === "synthesized" ? (
        <SynthesisPanel session={session} contributions={contributions} />
      ) : (
        <ContributionsList contributions={contributions} />
      )}
    </div>
  );
}
