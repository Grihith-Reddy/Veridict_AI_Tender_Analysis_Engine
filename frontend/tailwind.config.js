// C:\Users\grihi\OneDrive\Desktop\Personal Projects\Veridict\frontend\tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0A0F1E",
        surface: "#111827",
        panel: "#1a2234",
        line: "#1f2937",
        muted: "#6b7280",
        frost: "#9ca3af",
        accent: "#3b82f6",
        eligible: "#10b981",
        deny: "#ef4444",
        review: "#f59e0b",
        txt: "#f9fafb",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      animation: {
        "fade-slide": "fadeSlide 0.45s ease-out",
        shimmer: "shimmer 1.8s linear infinite",
        drawer: "drawerIn 0.28s ease-out",
      },
      keyframes: {
        fadeSlide: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        drawerIn: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
      boxShadow: {
        hud: "0 0 0 1px rgba(59, 130, 246, 0.08), inset 0 1px 0 rgba(249,250,251,0.06)",
      },
    },
  },
  plugins: [],
};
