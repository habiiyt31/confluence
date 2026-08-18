"use client";

import { useState } from "react";
import { useWallet } from "@/lib/useWallet";
import { submitContribution } from "@/lib/contract";

export function ContributeForm({
  sessionId,
  onSubmitted,
}: {
  sessionId: number;
  onSubmitted: () => void;
}) {
  const { address } = useWallet();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = 2000 - text.length;
  const canSubmit = address && text.trim().length >= 20 && text.length <= 2000;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitContribution(address, sessionId, text.trim());
      setText("");
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit contribution");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-3">
      <label className="field-label" htmlFor="contribution">
        Your contribution
      </label>
      <textarea
        id="contribution"
        className="field-textarea"
        placeholder="Add your perspective on the brief. One contribution per wallet."
        value={text}
        onChange={(e) => setText(e.target.value)}
        minLength={20}
        maxLength={2000}
      />
      <div className="flex items-center justify-between">
        <span className={`text-xs ${remaining < 0 ? "text-bad" : "text-paper-faint"}`}>
          {remaining} characters left
        </span>
        <button type="submit" disabled={!canSubmit || submitting} className="btn-primary">
          {submitting ? "Submitting…" : "Submit contribution"}
        </button>
      </div>
      {error && <p className="text-xs text-bad">{error}</p>}
      {!address && <p className="text-xs text-paper-muted">Connect a wallet to contribute.</p>}
    </form>
  );
}
