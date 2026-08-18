import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0A0F0E",
          surface: "#121917",
          raised: "#161F1C",
          border: "#223029",
        },
        paper: {
          DEFAULT: "#EDEAE2",
          muted: "#93998F",
          faint: "#5C6259",
        },
        synth: {
          DEFAULT: "#2BA893",
          soft: "#2BA89322",
        },
        reward: {
          DEFAULT: "#E8B34C",
          soft: "#E8B34C22",
        },
        good: "#7FD858",
        bad: "#E8654C",
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
