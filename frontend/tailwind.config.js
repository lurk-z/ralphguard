/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0A1213",
        panel: "#0F1C1E",
        panel2: "#14282A",
        elevated: "#173032",
        border: "#1F3A3C",
        brand: "#2DD4BF",
        risk: {
          low: "#34D399",
          mod: "#FBBF24",
          high: "#FB6F70",
        },
      },
      fontFamily: {
        display: ["Space Grotesk", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
