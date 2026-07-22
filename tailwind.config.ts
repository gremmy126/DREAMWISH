import type { Config } from "tailwindcss";

// Utility mapping for the DreamWish design tokens declared in app/globals.css.
// See design-system/DESIGN.md for the contract behind every value.
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
          "primary-strong": "var(--primary-strong)",
          "primary-soft": "var(--primary-soft)",
          secondary: "var(--secondary)",
          hover: "var(--hover)",
          text: "var(--text)",
          muted: "var(--muted)",
          soft: "var(--soft)",
          success: "var(--success)",
          "success-soft": "var(--success-soft)",
          warning: "var(--warning)",
          "warning-soft": "var(--warning-soft)",
          danger: "var(--danger)",
          "danger-soft": "var(--danger-soft)",
          info: "var(--info)",
          "info-soft": "var(--info-soft)"
        }
      },
      borderRadius: {
        app: "var(--radius-xl)",
        "app-sm": "var(--radius-sm)",
        "app-md": "var(--radius-md)",
        "app-lg": "var(--radius-lg)"
      },
      boxShadow: {
        app: "var(--shadow-app)",
        soft: "var(--shadow-soft)",
        overlay: "var(--shadow-overlay)"
      },
      transitionDuration: {
        fast: "150ms",
        base: "200ms",
        slow: "250ms"
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.2, 0, 0, 1)"
      }
    }
  },
  plugins: []
};

export default config;
