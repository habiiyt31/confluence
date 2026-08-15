import Link from "next/link";
import { StatusBadge } from "./StatusBadge";
import { formatGEN, daysRemaining } from "@/lib/format";
import { currentDay } from "@/lib/genlayer/contract";
import type { SessionDTO } from "@/lib/genlayer/contract";

export function SessionCard({ session }: { session: SessionDTO }) {
  const remaining = daysRemaining(
    session.created_at_day,
    session.contribution_window_days,
    currentDay()
  );

  return (
    <Link
      href={`/session/${session.id}`}
      className="card group block animate-rise transition-colors hover:border-paper-faint"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-base font-semibold leading-snug text-paper group-hover:text-white">
          {session.brief.length > 96 ? `${session.brief.slice(0, 96)}…` : session.brief}
        </h3>
        <StatusBadge status={session.status} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-paper-muted">
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
        {session.status === "open" && (
          <span>
            {remaining > 0 ? (
              <>
                <span className="font-mono text-paper">{remaining}d</span> left
              </>
            ) : (
              "window closed — ready to synthesize"
            )}
          </span>
        )}
      </div>
    </Link>
  );
}
