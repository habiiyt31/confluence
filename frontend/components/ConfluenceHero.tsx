/**
 * Homepage masthead: several distinct, muted strands (standing in for
 * separate contributions) converge at one point and continue as a
 * single settled line — the same idea the contract enacts on-chain,
 * rendered as the one deliberate illustration in this app rather than
 * a generic gradient glow.
 */
export function ConfluenceHero() {
  return (
    <svg
      viewBox="0 0 960 200"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-28 w-full sm:h-36"
      aria-hidden="true"
    >
      <path
        d="M-10,30 C220,30 340,95 480,100"
        fill="none"
        stroke="#2BA893"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path
        d="M-10,72 C220,72 340,98 480,100"
        fill="none"
        stroke="#6E93A6"
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M-10,128 C220,128 340,102 480,100"
        fill="none"
        stroke="#C97B6B"
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M-10,172 C220,172 340,104 480,100"
        fill="none"
        stroke="#7FA37A"
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="480" cy="100" r="4.5" fill="#E8B34C" />
      <path
        d="M480,100 C620,100 700,92 970,96"
        fill="none"
        stroke="#E8B34C"
        strokeWidth="2.25"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}
