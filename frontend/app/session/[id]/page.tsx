"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@/lib/useWallet";
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
} from "@/lib/contract";
import type { Contribution, Session } from "@/lib/contract";

export default function SessionPage() {
  // useParams() instead of the `params` prop: this page is already a
  // client component (needs useState/useEffect either way), and
  // useParams() sidesteps the server/client `params` contract entirely
  // -- which changed from a plain object to a Promise between Next.js
  // major versions and has broken pages that destructured it directly.
  const params = useParams<{ id: string }>();
  const sessionId = Number(params.id);
  const { address } = useWallet();

  const [session, setSession] = useState<Session | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [alreadyContributed, setAlreadyContributed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
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
      // A retry already ran inside lib/contract.ts (Studionet drops an
      // occasional request outright) -- if we get here it genuinely
      // failed. Keep any session data already on screen rather than
      // wiping the page: a stale-but-visible session plus a "try
      // again" banner is more useful than a blank error screen,
      // especially if this failed on a background refresh rather than
      // the very first load.
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [sessionId, address]);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !session) {
    return (
      <div className="card space-y-3 border-bad/30 bg-bad/10">
        <p className="text-sm text-bad">{error}</p>
        <button onClick={load} disabled={loading} className="btn-secondary">
          {loading ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
  }

  if (!session) {
    return <div className="card h-40 animate-pulseSlow" />;
  }

  const remaining = daysRemaining(session.createdAtDay, session.contributionWindowDays, currentDay());

  return (
    <div className="space-y-6">
      <Link href="/" className="text-xs text-paper-muted hover:text-paper">
        ← All sessions
      </Link>

      {error && (
        <div className="card flex items-center justify-between gap-3 border-bad/30 bg-bad/10">
          <p className="text-xs text-bad">{error}</p>
          <button onClick={load} disabled={loading} className="btn-ghost shrink-0 text-xs">
            {loading ? "Retrying…" : "Try again"}
          </button>
        </div>
      )}

      <div className="card animate-rise space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-xl font-semibold leading-snug text-paper sm:text-2xl">
            {session.brief}
          </h1>
          <StatusBadge status={session.status} />
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-paper-muted">
          <span>
            <span className="font-mono text-reward">{formatGEN(session.fundingAmount)} GEN</span>{" "}
            pool
          </span>
          <span>
            <span className="font-mono text-paper">
              {session.contributionCount}/{session.minContributions}
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
