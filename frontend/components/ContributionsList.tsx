import { truncateAddress, colorForIndex } from "@/lib/format";
import type { Contribution } from "@/lib/contract";

export function ContributionsList({ contributions }: { contributions: Contribution[] }) {
  if (contributions.length === 0) {
    return (
      <div className="card text-center text-sm text-paper-muted">
        No contributions yet — be the first.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {contributions.map((c) => (
        <div key={c.index} className="card">
          <div className="mb-2 flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: colorForIndex(c.index) }}
            />
            <span className="font-mono text-xs text-paper-muted">
              {truncateAddress(c.contributor)}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-paper">{c.text}</p>
        </div>
      ))}
    </div>
  );
}
