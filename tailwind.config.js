/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta FolhaPronta (mesmo design system do app/marketing).
        creme: "#FFF8EC",
        tinta: "#2B2233",
        cinza: "#7A6E83",
        coral: {
          50: "#FDEDEA",
          100: "#FBC9C2",
          200: "#F8A398",
          400: "#F76B5C",
          DEFAULT: "#F76B5C",
          600: "#C84638",
          800: "#8C2D22",
          900: "#591A12",
        },
        amarelo: {
          50: "#FFF6D9",
          100: "#FFE4A0",
          200: "#FFD66B",
          400: "#FFC93C",
          DEFAULT: "#FFC93C",
          600: "#D9A222",
          800: "#946A0E",
          900: "#5C4108",
        },
        turquesa: { 100: "#B3DDE1", DEFAULT: "#54A0A8", 800: "#234C51" },
        lavanda:  { 100: "#D4C2E3", DEFAULT: "#A685C9", 800: "#523B70" },
        erva:     "#5BA572",
        areia:    "#FFE9CB",
        tintaSoft: {
          50:  "#F0EDF2",
          100: "#D4CCD9",
          200: "#9B8FA8",
          400: "#5F4F70",
          600: "#3F324C",
          800: "#2B2233",
          900: "#1A141F",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
