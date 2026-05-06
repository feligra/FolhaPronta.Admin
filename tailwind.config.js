/** @type {import('tailwindcss').Config} */
const withAlpha = (varName) => `rgb(var(${varName}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tokens BRAND apontando pras CSS vars (ver src/styles/globals.css).
        // Modo escuro reescreve as vars; nenhum componente precisa usar `dark:`.
        creme:   withAlpha("--color-creme"),
        tinta:   withAlpha("--color-tinta"),
        cinza:   withAlpha("--color-cinza"),
        coral: {
          50:  withAlpha("--color-coral-50"),
          100: withAlpha("--color-coral-100"),
          200: withAlpha("--color-coral-200"),
          400: withAlpha("--color-coral-400"),
          DEFAULT: withAlpha("--color-coral"),
          600: withAlpha("--color-coral-600"),
          800: withAlpha("--color-coral-800"),
          900: withAlpha("--color-coral-900"),
        },
        amarelo: {
          50:  withAlpha("--color-amarelo-50"),
          100: withAlpha("--color-amarelo-100"),
          200: withAlpha("--color-amarelo-200"),
          400: withAlpha("--color-amarelo-400"),
          DEFAULT: withAlpha("--color-amarelo"),
          600: withAlpha("--color-amarelo-600"),
          800: withAlpha("--color-amarelo-800"),
          900: withAlpha("--color-amarelo-900"),
        },
        turquesa: {
          100: withAlpha("--color-turquesa-100"),
          DEFAULT: withAlpha("--color-turquesa"),
          800: withAlpha("--color-turquesa-800"),
        },
        lavanda: {
          100: withAlpha("--color-lavanda-100"),
          DEFAULT: withAlpha("--color-lavanda"),
          800: withAlpha("--color-lavanda-800"),
        },
        erva:    withAlpha("--color-erva"),
        areia:   withAlpha("--color-areia"),
        aviso:   withAlpha("--color-aviso"),
        tintaSoft: {
          50:  withAlpha("--color-tintaSoft-50"),
          100: withAlpha("--color-tintaSoft-100"),
          200: withAlpha("--color-tintaSoft-200"),
          400: withAlpha("--color-tintaSoft-400"),
          600: withAlpha("--color-tintaSoft-600"),
          800: withAlpha("--color-tintaSoft-800"),
          900: withAlpha("--color-tintaSoft-900"),
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
