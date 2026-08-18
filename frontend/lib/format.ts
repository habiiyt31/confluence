import { formatEther, parseEther } from "viem";
import type { SessionStatus } from "./contract";

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
  "#2BA893", // confluence teal (brand)
  "#E8B34C", // reward gold
  "#C97B6B", // muted coral
  "#6E93A6", // dusty blue
  "#7FA37A", // sage
  "#C9A227", // ochre
  "#8B7BB0", // muted plum
  "#4CA6C9", // cyan
  "#B0708F", // dusty rose
  "#9BAF5C", // olive
  "#C98F5C", // clay
  "#5C9B8A", // deep teal
];

export function colorForIndex(i: number): string {
  return ATTRIBUTION_PALETTE[i % ATTRIBUTION_PALETTE.length];
}
