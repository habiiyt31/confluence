"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/useWallet";
import { createSession } from "@/lib/contract";
import { genToWei } from "@/lib/format";

export function CreateSessionForm({ onClose }: { onClose: () => void }) {
  const { address } = useWallet();
  const [brief, setBrief] = useState("");
  const [windowDays, setWindowDays] = useState("7");
  const [minContributions, setMinContributions] = useState("3");
  const [funding, setFunding] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const canSubmit =
    address &&
    brief.trim().length >= 20 &&
    Number(windowDays) >= 1 &&
    Number(minContributions) >= 2 &&
    Number(funding) > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await createSession(address, {
        brief: brief.trim(),
        contributionWindowDays: Number(windowDays),
        minContributions: Number(minContributions),
        fundingWei: genToWei(funding),
      });
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card animate-rise space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-paper">Convene a session</h2>
        <button type="button" onClick={onClose} className="btn-ghost text-xs">
          Cancel
        </button>
      </div>

      <div>
        <label className="field-label" htmlFor="brief">
          Brief
        </label>
        <textarea
          id="brief"
          className="field-textarea"
          placeholder="What should contributors weigh in on? Be specific — this is what the synthesis will answer."
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          minLength={20}
          maxLength={4000}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <label className="field-label" htmlFor="window">
            Window (days)
          </label>
          <input
            id="window"
            type="number"
            min={1}
            max={90}
            className="field-input"
            value={windowDays}
            onChange={(e) => setWindowDays(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="min">
            Min. contributions
          </label>
          <input
            id="min"
            type="number"
            min={2}
            max={12}
            className="field-input"
            value={minContributions}
            onChange={(e) => setMinContributions(e.target.value)}
            required
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="field-label" htmlFor="funding">
            Reward pool (GEN)
          </label>
          <input
            id="funding"
            type="number"
            step="0.0001"
            min="0"
            className="field-input"
            placeholder="10"
            value={funding}
            onChange={(e) => setFunding(e.target.value)}
            required
          />
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-bad/30 bg-bad/10 p-2.5 text-xs text-bad">
          {error}
        </p>
      )}

      {!address && (
        <p className="text-xs text-paper-muted">Connect a wallet to convene a session.</p>
      )}

      <button type="submit" disabled={!canSubmit || submitting} className="btn-primary w-full">
        {submitting ? "Funding session…" : "Fund & open session"}
      </button>
    </form>
  );
}
