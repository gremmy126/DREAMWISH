import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "var(--background)",
          card: "var(--card)",
          border: "var(--border)",
          primary: "var(--primary)",
          hover: "var(--hover)",
          text: "var(--text)",
          muted: "var(--muted)",
          soft: "var(--soft)"
        }
      },
      borderRadius: {
        app: "18px"
      },
      boxShadow: {
        app: "0 18px 45px rgba(15, 23, 42, 0.06)",
        soft: "0 8px 24px rgba(15, 23, 42, 0.04)"
      }
    }
  },
  plugins: []
};

export default config;
