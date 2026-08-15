import { STATUS_LABEL, STATUS_DOT } from "@/lib/format";
import type { SessionStatus } from "@/lib/genlayer/contract";

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className="pill">
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}
