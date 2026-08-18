"use client";

import { useEffect, useState, useCallback } from "react";
import { SessionCard } from "@/components/SessionCard";
import { CreateSessionForm } from "@/components/CreateSessionForm";
import { ConfluenceHero } from "@/components/ConfluenceHero";
import { getSessions } from "@/lib/contract";
import type { Session } from "@/lib/contract";

const PAGE_SIZE = 20;

export default function HomePage() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSessions(0, PAGE_SIZE);
      setSessions(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <ConfluenceHero />

      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold italic text-paper sm:text-3xl">
            Open briefs
          </h1>
          <p className="mt-1 text-sm text-paper-muted">
            Fund a brief, gather contributions, let verified synthesis split the pool.
          </p>
        </div>
        {!showCreate && (
          <button onClick={() => setShowCreate(true)} className="btn-primary shrink-0">
            Convene
          </button>
        )}
      </div>

      {showCreate && (
        <CreateSessionForm
          onClose={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {error && (
        <div className="card flex items-center justify-between gap-3 border-bad/30 bg-bad/10">
          <p className="text-sm text-bad">{error}</p>
          <button onClick={load} disabled={loading} className="btn-secondary shrink-0">
            {loading ? "Retrying…" : "Try again"}
          </button>
        </div>
      )}

      {!sessions && !error && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card h-32 animate-pulseSlow" />
          ))}
        </div>
      )}

      {sessions && sessions.length === 0 && (
        <div className="card text-center text-sm text-paper-muted">
          No sessions yet. Be the first to convene one.
        </div>
      )}

      {sessions && sessions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}
