import { formatEther, parseEther } from "viem";
import type { SessionStatus } from "./genlayer/contract";

export function formatGEN(wei: string | bigint, maxDecimals = 4): string {
  const value = typeof wei === "string" ? BigInt(wei) : wei;
  const formatted = formatEther(value);
  const [whole, frac = ""] = formatted.split(".");
  if (!frac) return whole;
  return `${whole}.${frac.slice(0, maxDecimals).replace(/0+$/, "") || "0"}`;
}

export function genToWei(gen: string): bigint {
  return parseEther(gen as `${number}`);
}

export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function bpsToPercent(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

export function daysRemaining(createdAtDay: number, windowDays: number, nowDay: number): number {
  return createdAtDay + windowDays - nowDay;
}

export const STATUS_LABEL: Record<SessionStatus, string> = {
  open: "Open for contributions",
  closed: "Awaiting synthesis",
  synthesized: "Synthesized",
  failed: "Failed — under minimum",
};

export const STATUS_DOT: Record<SessionStatus, string> = {
  open: "bg-good",
  closed: "bg-reward",
  synthesized: "bg-synth",
  failed: "bg-bad",
};

/**
 * A fixed, deterministic color rotation for the attribution ledger bar —
 * same contribution index always gets the same color across renders,
 * so the bar reads consistently as you scroll and reload.
 */
export const ATTRIBUTION_PALETTE = [
  "#7C6CF0", // synth violet
  "#E8B34C", // reward gold
  "#4ADE80", // good green
  "#4CC9E8", // cyan
  "#F0654C", // bad coral (used sparingly, still legible)
  "#C084FC", // light purple
  "#F0A15C", // amber
  "#5CE8C0", // mint
  "#F06CA8", // pink
  "#8FA3F0", // periwinkle
  "#E8E05C", // yellow
  "#A3E85C", // lime
];

export function colorForIndex(i: number): string {
  return ATTRIBUTION_PALETTE[i % ATTRIBUTION_PALETTE.length];
}
