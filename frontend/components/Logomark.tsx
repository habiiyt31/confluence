/**
 * The Confluence mark: three streams converging into one node, then
 * continuing as a single line. It's a literal depiction of the word
 * "confluence" and of what the contract does — several contributions
 * merging into one settled, attributed output — not a generic geometric
 * badge. Same paths (scaled) as app/icon.svg, which is the browser
 * favicon; keep the two in sync if you change one.
 */
export function Logomark({
  size = 28,
  withBackground = true,
}: {
  size?: number;
  withBackground?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {withBackground && <rect width="32" height="32" rx="7" fill="#0A0F0E" />}
      <path
        d="M7 9 C13 9 16 13 21 15.3"
        fill="none"
        stroke="#2BA893"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M7 16 L20 16" fill="none" stroke="#2BA893" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M7 23 C13 23 16 19 21 16.7"
        fill="none"
        stroke="#2BA893"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="22.5" cy="16" r="2.4" fill="#E8B34C" />
      <path d="M25.4 16 L27.5 16" fill="none" stroke="#2BA893" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
