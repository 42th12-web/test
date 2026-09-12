/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: "#101315",
          900: "#15191c",
          800: "#1c2124",
          700: "#252b2f",
          600: "#333a3f",
          500: "#4a5359",
        },
        patina: {
          400: "#6fb89a",
          500: "#4fa184",
          600: "#3d8168",
        },
        rust: {
          400: "#d97a3f",
          500: "#c1591b",
          600: "#9c4614",
        },
        amber: {
          400: "#e0b563",
          500: "#d9a441",
        },
        teal: {
          400: "#5fc4bd",
          500: "#3aafa9",
        },
        ink: {
          100: "#ece9e2",
          300: "#b9beC0",
          500: "#8b9198",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
