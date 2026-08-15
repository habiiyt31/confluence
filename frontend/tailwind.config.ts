import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0B0D10",
          surface: "#14171C",
          raised: "#191D23",
          border: "#262B33",
        },
        paper: {
          DEFAULT: "#E8E6E1",
          muted: "#8B8F98",
          faint: "#5C616B",
        },
        synth: {
          DEFAULT: "#7C6CF0",
          soft: "#7C6CF022",
        },
        reward: {
          DEFAULT: "#E8B34C",
          soft: "#E8B34C22",
        },
        good: "#4ADE80",
        bad: "#F0654C",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        card: "14px",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSlow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        rise: "rise 0.5s ease-out both",
        pulseSlow: "pulseSlow 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
