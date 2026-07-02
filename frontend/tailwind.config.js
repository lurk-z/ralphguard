/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ---- KMUTNB white + orange theme ----
        // token names kept stable so existing bg-panel/border/brand classes keep working
        ink: "#FFFDFB",        // page background (warm white)
        panel: "#FFFFFF",      // card surface
        panel2: "#FFF4EC",     // soft orange-tinted surface
        elevated: "#F4F1EE",   // inputs / subtle surface
        border: "#EAE2DB",     // light warm border
        brand: "#E8551C",      // KMUTNB orange (primary)
        "brand-dark": "#C2440F",
        "brand-soft": "#FFE9DC",
        accent: "#F7A21B",     // gold accent
        ink2: "#2A2320",       // primary text
        risk: {
          low: "#16A34A",
          mod: "#E08A00",
          high: "#DC2626",
        },
      },
      fontFamily: {
        display: ["Space Grotesk", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(40,30,20,0.08), 0 1px 2px rgba(40,30,20,0.04)",
        soft: "0 8px 30px rgba(232,85,28,0.10)",
      },
    },
  },
  plugins: [],
};
