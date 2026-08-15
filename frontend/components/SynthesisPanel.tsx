import { AttributionBar } from "./AttributionBar";
import type { ContributionDTO, SessionDTO } from "@/lib/genlayer/contract";

export function SynthesisPanel({
  session,
  contributions,
}: {
  session: SessionDTO;
  contributions: ContributionDTO[];
}) {
  return (
    <div className="space-y-4">
      <div className="card border-synth/30 bg-synth/5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-synth">Synthesis</p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-paper">
          {session.synthesis}
        </p>
        {session.synthesis_reasoning && (
          <p className="mt-4 border-t border-synth/20 pt-3 text-xs leading-relaxed text-paper-muted">
            <span className="font-medium text-paper-muted">Attribution reasoning: </span>
            {session.synthesis_reasoning}
          </p>
        )}
      </div>

      <div className="card">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-paper-muted">
          Attribution ledger
        </p>
        <AttributionBar contributions={contributions} />
      </div>
    </div>
  );
}
