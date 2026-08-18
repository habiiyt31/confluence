"use client";

import { colorForIndex, truncateAddress, bpsToPercent } from "@/lib/format";
import type { Contribution } from "@/lib/contract";

/**
 * The one visual signature of this app: a segmented ledger bar where
 * each segment's width is literally the on-chain attribution_bps for
 * that contribution — the same number the validators independently
 * agreed on before any GEN moved. Not a generic progress bar; it's a
 * direct rendering of the contract's own settlement math.
 */
export function AttributionBar({
  contributions,
  compact = false,
}: {
  contributions: Contribution[];
  compact?: boolean;
}) {
  const hasAttribution = contributions.some((c) => c.attributionBps > 0);

  if (!hasAttribution) {
    return (
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink-raised">
        <div className="h-full w-full animate-pulseSlow bg-ink-border" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink-raised">
        {contributions.map((c) => (
          <div
            key={c.index}
            style={{
              width: `${c.attributionBps / 100}%`,
              backgroundColor: colorForIndex(c.index),
            }}
            className="h-full transition-all duration-500"
            title={`${truncateAddress(c.contributor)} — ${bpsToPercent(c.attributionBps)}`}
          />
        ))}
      </div>

      {!compact && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {contributions
            .slice()
            .sort((a, b) => b.attributionBps - a.attributionBps)
            .map((c) => (
              <div key={c.index} className="flex items-center gap-1.5 text-xs">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: colorForIndex(c.index) }}
                />
                <span className="font-mono text-paper-muted">
                  {truncateAddress(c.contributor)}
                </span>
                <span className="font-mono text-paper">{bpsToPercent(c.attributionBps)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
